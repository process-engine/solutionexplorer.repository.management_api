import {NotImplementedError} from '@essential-projects/errors_ts';
import {IHttpClient} from '@essential-projects/http_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';
import {ExternalAccessor, ManagementApiClient} from '@process-engine/management_api_client';
import {DataModels} from '@process-engine/management_api_contracts';
import {IDiagram, ISolution} from '@process-engine/solutionexplorer.contracts';
import {IFileChangedCallback, ISolutionExplorerRepository} from '@process-engine/solutionexplorer.repository.contracts';

interface IParsedDiagramUri {
  baseRoute: string;
  processModelId: string;
}

export class SolutionExplorerManagementApiRepository implements ISolutionExplorerRepository {

  private _httpClient: IHttpClient;

  private _managementApi: ManagementApiClient;
  private _identity: IIdentity;
  private _externalAccessorBaseRoute: string;

  constructor(httpClient: IHttpClient) {
    this._httpClient = httpClient;
  }

  public watchFile(filepath: string, callback: IFileChangedCallback): void {
    throw new Error('Method not supported.');
  }

  public unwatchFile(filepath: string): void {
    throw new Error('Method not supported.');
  }

  public async openPath(pathspec: string, identity: IIdentity): Promise<void> {
    if (pathspec.endsWith('/')) {
      pathspec = pathspec.substr(0, pathspec.length - 1);
    }

    const managementApi: ManagementApiClient = this._createManagementClient(pathspec);
    // test connection
    await managementApi.getProcessModels(identity);

    this._managementApi = managementApi;
    this._identity = identity;
  }

  public async getDiagrams(): Promise<Array<IDiagram>> {
    const processModels: DataModels.ProcessModels.ProcessModelList = await this._managementApi.getProcessModels(this._identity);

    const diagrams: Array<IDiagram> = processModels.processModels.map((processModel: DataModels.ProcessModels.ProcessModel) => {
      return this._mapProcessModelToDiagram(processModel, this._managementApi);
    });

    return diagrams;
  }

  public async getDiagramByName(diagramName: string): Promise<IDiagram> {
    const processModel: DataModels.ProcessModels.ProcessModel = await this._managementApi.getProcessModelById(this._identity, diagramName);

    const diagrams: IDiagram = this._mapProcessModelToDiagram(processModel, this._managementApi);

    return diagrams;
  }

  public async saveSolution(solution: ISolution, pathspec?: string): Promise<void> {
    if (pathspec) {

      const managementApi: ManagementApiClient = this._createManagementClient(pathspec);

      solution.uri = pathspec;
      solution.diagrams.forEach((diagram: IDiagram) => {
        diagram.uri = `${pathspec}/${diagram.id}`;
      });

      solution.diagrams.map((diagram: IDiagram): Promise<void> => {

        const payload: DataModels.ProcessModels.UpdateProcessDefinitionsRequestPayload = {
          overwriteExisting: true,
          xml: diagram.xml,
        };

        return managementApi.updateProcessDefinitionsByName(this._identity, diagram.id, payload);
      });

      return;
    }

    const promises: Array<Promise<void>> = solution.diagrams.map((diagram: IDiagram) => {
      return this.saveDiagram(diagram);
    });

    await Promise.all(promises);
  }

  public async saveDiagram(diagramToSave: IDiagram, pathspec?: string): Promise<void> {
    const payload: DataModels.ProcessModels.UpdateProcessDefinitionsRequestPayload = {
      overwriteExisting: true,
      xml: diagramToSave.xml,
    };

    if (pathspec) {

      const managementApi: ManagementApiClient = this._createManagementClient(pathspec);
      await managementApi.updateProcessDefinitionsByName(this._identity, diagramToSave.id, payload);

      return;
    }

    const parsedDiagramUri: IParsedDiagramUri = this._parseDiagramUri(diagramToSave.uri);
    await this._managementApi.updateProcessDefinitionsByName(this._identity, parsedDiagramUri.processModelId, payload);
  }

  public async renameDiagram(diagram: IDiagram, newName: string): Promise<IDiagram> {
    throw new NotImplementedError('Renaming diagrams is currently not supported.');
  }

  public async deleteDiagram(diagram: IDiagram): Promise<void> {
    this._managementApi.deleteProcessDefinitionsByProcessModelId(this._identity, diagram.id);
  }

  private _createManagementClient(baseRoute: string): ManagementApiClient {
    const externalAccessor: ExternalAccessor = new ExternalAccessor(this._httpClient);
    this._externalAccessorBaseRoute = (externalAccessor as any).baseUrl = `${baseRoute}/${(externalAccessor as any).baseUrl}`;

    const managementApi: ManagementApiClient = new ManagementApiClient(externalAccessor);

    return managementApi;
  }

  private _getBaseRoute(managementApi: ManagementApiClient): string {
    return this._externalAccessorBaseRoute;
  }

  private _parseDiagramUri(uri: string): IParsedDiagramUri {
    const lastIndexOfSlash: number = uri.lastIndexOf('/');

    const baseRoute: string = uri.substring(0, lastIndexOfSlash);
    const processModelId: string = uri.substring(lastIndexOfSlash + 1, uri.length);

    return {
      baseRoute,
      processModelId,
    };
  }

  private _mapProcessModelToDiagram(processModel: DataModels.ProcessModels.ProcessModel, managementApi: ManagementApiClient): IDiagram {
    const baseRoute: string = this._getBaseRoute(managementApi);

    const diagramUri: string = `${baseRoute}/${processModel.id}`;

    const diagram: IDiagram = {
      name: processModel.id,
      xml: processModel.xml,
      id: processModel.id,
      uri: diagramUri,
    };

    return diagram;
  }
}
