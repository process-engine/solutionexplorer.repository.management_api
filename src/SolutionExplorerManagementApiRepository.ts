import {IIdentity, IQueryClause} from '@essential-projects/core_contracts';
import {InternalServerError, NotFoundError} from '@essential-projects/errors_ts';
import {IHttpClient} from '@essential-projects/http_contracts';
import {ExternalAccessor, ManagementApiClientService} from '@process-engine/management_api_client';
import {ManagementContext, ProcessModelExecution} from '@process-engine/management_api_contracts';
import {IDiagram, ISolution} from '@process-engine/solutionexplorer.contracts';
import {ISolutionExplorerRepository} from '@process-engine/solutionexplorer.repository.contracts';

export class SolutionExplorerManagementApiRepository implements ISolutionExplorerRepository {

  private _httpClient: IHttpClient;

  private _managementApi: ManagementApiClientService;
  private _managementApiContext: ManagementContext;

  constructor(httpClient: IHttpClient) {
    this._httpClient = httpClient;
  }

  public async openPath(pathspec: string, identity: IIdentity): Promise<void> {
    if (pathspec.endsWith('/')) {
      pathspec = pathspec.substr(0, pathspec.length - 1);
    }

    const externalAccessor: ExternalAccessor = new ExternalAccessor(this._httpClient);
    (externalAccessor as any).baseRoute = `${pathspec}/${(externalAccessor as any).baseRoute}`;

    const managementApi: ManagementApiClientService = new ManagementApiClientService(externalAccessor);
    const managementApiContext: ManagementContext = this._getManagementApiContext(identity);

    // test connection
    await managementApi.getProcessModels(managementApiContext);

    this._managementApi = managementApi;
    this._managementApiContext = managementApiContext;
  }

  public async getDiagrams(): Promise<Array<IDiagram>> {
    const processModels: ProcessModelExecution.ProcessModelList = await this._managementApi.getProcessModels(this._managementApiContext);

    const diagrams: Array<IDiagram> = processModels.processModels.map(this._mapProcessModelToDiagram);

    return diagrams;
  }

  public async getDiagramByName(diagramName: string): Promise<IDiagram> {
    const query: IQueryClause = {
      attribute: 'name',
      operator: '=',
      value: diagramName,
    };

    const url: string = `${this._baseUri}/?query=${JSON.stringify(query)}`;

    const response: BodyInit = await fetch(url)
      .then((res: Response) => res.json());
    const processDefList: Array<IProcessDefEntity> = response.data;

    const diagrams: IDiagram = this._mapProcessDefToDiagram(processDefList[0]);

    return diagrams;
  }

  public async openSingleDiagram(pathToDiagram: string, identity: IIdentity): Promise<IDiagram> {
    const response: BodyInit = await fetch(pathToDiagram)
      .then((res: Response) => res.json());
    const processDef: IProcessDefEntity = response;
    const diagram: IDiagram = await this._mapProcessDefToDiagram(processDef);

    return diagram;
  }

  public async saveSingleDiagram(diagramToSave: IDiagram, identity: IIdentity, pathspec?: string): Promise<IDiagram> {
    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          xml: diagramToSave.xml,
      }),
    };

    let response: BodyInit;
    try {
      response = await fetch(`${diagramToSave.uri}/updateBpmn`, options)
        .then((res: Response) => res.json());
    } catch (e) {
      throw new NotFoundError('Datastore is not reachable.');
    }

    const body: {result: boolean} = response;
    const saveNotSucessfull: boolean = body.result === false;

    if (saveNotSucessfull) {
      throw new InternalServerError('Diagram could not be saved.');
    }

    return diagramToSave;
  }

  public async saveSolution(solution: ISolution, pathspec?: string): Promise<void> {
    if (pathspec) {

      try {
        await this.openPath(pathspec, this._identity);
      } catch (e) {
        throw new NotFoundError('Given path is not reachable.');
      }

      solution.uri = pathspec;
      solution.diagrams.forEach((diagram: IDiagram) => {
        diagram.uri = `${pathspec}/datastore/ProcessDef/${diagram.id}`;
      });
    }

    const promises: Array<Promise<void>> = solution.diagrams.map((diagram: IDiagram) => {
      return this.saveDiagram(diagram);
    });

    await Promise.all(promises);
  }

  public async saveDiagram(diagramToSave: IDiagram, pathspec?: string): Promise<void> {
    const options: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          xml: diagramToSave.xml,
      }),
    };

    let response: BodyInit;
    try {
      response = await fetch(`${diagramToSave.uri}/updateBpmn`, options)
        .then((res: Response) => res.json());
    } catch (e) {
      throw new NotFoundError('Datastore is not reachable.');
    }

    const body: {result: boolean} = response;
    const saveNotSucessfull: boolean = body.result === false;

    if (saveNotSucessfull) {
      throw new InternalServerError('Diagram could not be saved.');
    }
  }

  private _mapProcessModelToDiagram = (processModel: ProcessModelExecution.ProcessModel): IDiagram => {
    const diagram: IDiagram = {
      name: processDef.,
      xml: processDef.xml,
      id: processDef.id,
      uri: `${this._baseUri}/${processDef.id}`,
    };

    return diagram;
  }

  private _getManagementApiContext(identity: IIdentity): ManagementContext {
    // TODO (ph): Why does IIdentity does not have a token field?
    const accessToken: string = (identity as any).accessToken;
    const context: ManagementContext = {
      identity: accessToken,
    };

    return context;
  }
}
