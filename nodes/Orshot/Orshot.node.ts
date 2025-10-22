import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

const getMimeType = (format: string): string => {
	const mimeTypes: { [key: string]: string } = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		webp: 'image/webp',
		pdf: 'application/pdf',
	};
	return mimeTypes[format] || 'application/octet-stream';
};

export class Orshot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Orshot',
		name: 'orshot',
		group: ['transform'],
		icon: 'file:orshot.svg',
    documentationUrl: 'https://el.orshot.com/n8n-docs',
		version: 3,
		description: 'Automated Image Generation for Marketing',
		defaults: {
			name: 'Orshot',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'orshotApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
        noDataExpression: true,
				default: 'https://api.orshot.com/v1/generate/images',
        options: [{
          name: 'Generate Image From a Library Template',
          value: 'https://api.orshot.com/v1/generate/images',
          description: 'Endpoint: https://api.orshot.com/v1/generate/images',
          action: 'Generate an image from a library template',
        },
        {
          name: 'Generate Image From an Orshot Studio Template',
          value: 'https://api.orshot.com/v1/studio/render',
          description: 'Endpoint: https://api.orshot.com/v1/studio/render',
          action: 'Generate an image from a studio template',
        }],
				required: true,
				description: 'Orshot API Endpoint URL(ref: https://orshot.com/docs/api-reference)',
			},
			{
				displayName: 'Template Name or ID',
				name: 'libraryTemplateId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTemplates',
				},
        displayOptions: {
          show: {
            operation: ['https://api.orshot.com/v1/generate/images'],
          },
        },
				default: '',
				required: true,
				description: 'Select the template to render from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Template Name or ID',
				name: 'studioTemplateId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getStudioTemplates',
				},
        displayOptions: {
          show: {
            operation: ['https://api.orshot.com/v1/studio/render'],
          },
        },
				default: '',
				required: true,
				description: 'Select the studio template to render from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Response Type',
				name: 'responseType',
				type: 'options',
				options: [
					{
						name: 'Base64',
						value: 'base64',
					},
					{
						name: 'Binary',
						value: 'binary',
					},
					{
						name: 'URL',
						value: 'url',
					},
				],
				default: 'base64',
				required: true,
				description: 'Type of response to return',
			},
			{
				displayName: 'Response Format',
				name: 'responseFormat',
				type: 'options',
				options: [
          {
            name: 'JPEG',
            value: 'jpeg',
          },
          {
            name: 'JPG',
            value: 'jpg',
          },
          {
            name: 'PDF',
            value: 'pdf',
          },
          {
            name: 'PNG',
            value: 'png',
          },
          {
            name: 'WebP',
            value: 'webp',
          },
        ],
				default: 'png',
				required: true,
				description: 'Format of the rendered image',
			},
			{
				displayName: 'Custom File Name',
				name: 'customFileName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['https://api.orshot.com/v1/studio/render'],
						responseType: ['url', 'binary'],
					},
				},
				default: '',
				description: 'Custom file name for the output file (without extension). Works only with URL or Binary response types.',
			},
			{
				displayName: 'Scale',
				name: 'scale',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['https://api.orshot.com/v1/studio/render'],
					},
				},
				default: 1,
				typeOptions: {
					minValue: 0.1,
					maxValue: 10,
					numberPrecision: 1,
				},
				description: 'Scale factor for the rendered output (0.1 to 10)',
			},
			{
				displayName: 'Modifications',
				name: 'libraryModifications',
				type: 'fixedCollection',
				placeholder: 'Add Modification',
				default: {},
        displayOptions: {
          show: {
            operation: ['https://api.orshot.com/v1/generate/images'],
          },
        },
				typeOptions: {
					multipleValues: true,
					multipleValueButtonText: 'Add Modification',
				},
				options: [
					{
						displayName: 'Modification',
						name: 'modification',
						values: [
							{
								displayName: 'Key Name or ID',
								name: 'key',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getLibraryTemplateModifications',
									loadOptionsDependsOn: ['libraryTemplateId'],
								},
								default: '',
								description: 'Select the modification to apply. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Enter the value for this modification',
							},
						],
					},
				],
				description: 'Template modifications to apply. Select a modification key and enter its value.',
			},
			{
				displayName: 'Modifications',
				name: 'studioModifications',
				type: 'fixedCollection',
				placeholder: 'Add Modification',
				default: {},
        displayOptions: {
          show: {
            operation: ['https://api.orshot.com/v1/studio/render'],
          },
        },
				typeOptions: {
					multipleValues: true,
					multipleValueButtonText: 'Add Modification',
				},
				options: [
					{
						displayName: 'Modification',
						name: 'modification',
						values: [
							{
								displayName: 'Key Name or ID',
								name: 'key',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getStudioTemplateModifications',
									loadOptionsDependsOn: ['studioTemplateId'],
								},
								default: '',
								description: 'Select the modification to apply. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Enter the value for this modification',
							},
						],
					},
				],
				description: 'Template modifications to apply. Select a modification key and enter its value.',
			},
		],
	};

	methods = {
			loadOptions: {
				async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
					try {
						const response = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
							method: 'GET',
							url: 'https://api.orshot.com/v1/templates',
							headers: {
								'Content-Type': 'application/json',
							},
						});

						const templates = Array.isArray(response) ? response : [];
						
						return templates.map((template: any) => ({
							name: `${template.title}`,
							value: template.id,
						}));
					} catch (error) {
						throw new NodeOperationError(this.getNode(), `Failed to load templates: ${error.message}`);
					}
				},
				async getStudioTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
					try {
						const response = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
							method: 'GET',
							url: 'https://api.orshot.com/v1/studio/templates',
							headers: {
								'Content-Type': 'application/json',
							},
						});

						const templates = Array.isArray(response) ? response : [];
						
						return templates.map((template: any) => ({
							name: `${template.name}`,
							value: template.id,
              description: template?.description || '',
						}));
					} catch (error) {
						throw new NodeOperationError(this.getNode(), `Failed to load studio templates: ${error.message}`);
					}
				},
				async getLibraryTemplateModifications(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
					try {
						const templateId = this.getCurrentNodeParameter('libraryTemplateId') as string;
						if (!templateId) {
							return [];
						}

						// First try to get template details from the templates endpoint
						const templatesResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
							method: 'GET',
							url: 'https://api.orshot.com/v1/templates',
							headers: {
								'Content-Type': 'application/json',
							},
						});

						const templates = Array.isArray(templatesResponse) ? templatesResponse : [];
						const selectedTemplate = templates.find((template: any) => template.id === templateId);

						if (selectedTemplate && selectedTemplate.modifications) {
							return selectedTemplate.modifications.map((modification: any) => ({
								name: modification.description || modification.key,
								value: modification.key,
							}));
						}

						// Fallback to modifications endpoint if template doesn't have modifications
						const response = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
							method: 'GET',
							url: `https://api.orshot.com/v1/templates/modifications?template_id=${templateId}`,
							headers: {
								'Content-Type': 'application/json',
							},
						});

						const modifications = Array.isArray(response) ? response : [];
						
						return modifications.map((modification: any) => ({
							name: modification.description || modification.key,
							value: modification.key,
						}));
					} catch (error) {
						// Return empty array instead of throwing error to avoid breaking the UI
						return [{
							name: `Error: ${error.message}`,
							value: 'error',
						}];
					}
				},				async getStudioTemplateModifications(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
					try {
						const templateId = this.getCurrentNodeParameter('studioTemplateId') as string;
						if (!templateId) {
							return [];
						}

						const response = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
							method: 'GET',
							url: `https://api.orshot.com/v1/studio/template/modifications?templateId=${templateId}`,
							headers: {
								'Content-Type': 'application/json',
							},
						});

						const modifications = Array.isArray(response) ? response : [];
						
						return modifications.map((modification: any) => ({
							name: modification.description || modification.id,
							value: modification.id,
						}));
					} catch (error) {
						// Return empty array instead of throwing error to avoid breaking the UI
						return [{
							name: `Error: ${error.message}`,
							value: 'error',
						}];
					}
				},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;
				
				// Get the correct templateId based on the operation
				let templateId: string;
				if (operation === 'https://api.orshot.com/v1/generate/images') {
					templateId = this.getNodeParameter('libraryTemplateId', itemIndex, '') as string;
				} else {
					templateId = this.getNodeParameter('studioTemplateId', itemIndex, '') as string;
				}
				
				const responseType = this.getNodeParameter('responseType', itemIndex, '') as string;
				const responseFormat = this.getNodeParameter('responseFormat', itemIndex, '') as string;
				
				// Get the modifications from the correct parameter based on operation
				let modificationsData: any;
				if (operation === 'https://api.orshot.com/v1/generate/images') {
					modificationsData = this.getNodeParameter('libraryModifications', itemIndex, {}) as any;
				} else {
					modificationsData = this.getNodeParameter('studioModifications', itemIndex, {}) as any;
				}

				// Convert fixedCollection format to object
				let modifications: any = {};
				if (modificationsData.modification && Array.isArray(modificationsData.modification)) {
					modificationsData.modification.forEach((mod: any) => {
						if (mod.key && mod.value !== undefined && mod.value !== '') {
							modifications[mod.key] = mod.value;
						}
					});
				}

				// Prepare the request body
				const requestBody: any = {
					templateId,
					modifications,
					source: 'n8n-integration',
					response: {
						format: responseFormat,
						type: responseType,
					},
				};

				// Add studio-specific parameters
				if (operation === 'https://api.orshot.com/v1/studio/render') {
					const customFileName = this.getNodeParameter('customFileName', itemIndex, '') as string;
					const scale = this.getNodeParameter('scale', itemIndex, 1) as number;

					if (customFileName && (responseType === 'url' || responseType === 'binary')) {
						requestBody.response.fileName = customFileName;
					}

					if (scale && scale !== 1) {
						requestBody.response.scale = scale;
					}
				}

				// Make the API request with authentication
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
					method: 'POST',
					url: operation,
					headers: {
						'Content-Type': 'application/json',
					},
					body: requestBody,
					returnFullResponse: true,
					encoding: responseType === 'binary' ? 'arraybuffer' : 'text',
				});

				// Check for successful response
				if (response.statusCode < 200 || response.statusCode >= 300) {
					let errorMessage = `API request failed with status ${response.statusCode}`;
					
					// Try to extract error message from response body
					try {
						const errorBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
						if (errorBody && errorBody.error) {
							errorMessage += `: ${errorBody.error}`;
						} else if (errorBody && errorBody.message) {
							errorMessage += `: ${errorBody.message}`;
						}
					} catch {
						// If we can't parse the error body, just use the status code
						errorMessage += `: ${response.body || 'Unknown error'}`;
					}
					
					throw new NodeOperationError(this.getNode(), errorMessage, { itemIndex });
				}

				let outputData: any = {
					templateId,
					responseType,
					responseFormat,
					statusCode: response.statusCode,
					modifications: modifications,
				};

				// Handle different response types
				switch (responseType) {
					case 'base64':
						outputData.data = response.body;
						outputData.mimeType = getMimeType(responseFormat);
						break;
					case 'binary':
						// Use prepareBinaryData for proper binary handling
						const binaryData = await this.helpers.prepareBinaryData(
							response.body as ArrayBuffer,
							`orshot-image.${responseFormat}`,
							getMimeType(responseFormat)
						);
						
						returnData.push({
							json: {
								templateId,
								responseType,
								responseFormat,
								statusCode: response.statusCode,
								modifications: modifications,
							},
							binary: {
								data: binaryData,
							},
							pairedItem: itemIndex,
						});
						continue; // Skip the regular returnData.push below
					case 'url':
						// For URL response, parse the JSON if it's a string
						let urlData = response.body;
						if (typeof response.body === 'string') {
							try {
								urlData = JSON.parse(response.body);
							} catch {
								// If parsing fails, keep as string
							}
						}
						outputData.data = urlData;
						break;
					default:
						outputData.data = response.body;
				}

				returnData.push({
					json: outputData,
					pairedItem: itemIndex,
				});

			} catch (error) {
				// Enhanced error handling
				let errorMessage = error.message || 'Unknown error occurred';
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;
				
				// Get the correct templateId based on the operation
				let templateId: string;
				if (operation === 'https://api.orshot.com/v1/generate/images') {
					templateId = this.getNodeParameter('libraryTemplateId', itemIndex, '') as string;
				} else {
					templateId = this.getNodeParameter('studioTemplateId', itemIndex, '') as string;
				}
				
				let errorDetails: any = {
					templateId,
					operation,
					timestamp: new Date().toISOString(),
				};

				// Add more context if available
				if (error.response) {
					errorDetails.httpStatus = error.response.status;
					errorDetails.httpStatusText = error.response.statusText;
					
					// Try to extract API error details
					if (error.response.data) {
						try {
							const errorData = typeof error.response.data === 'string' 
								? JSON.parse(error.response.data) 
								: error.response.data;
							
							if (errorData.error) {
								errorMessage = errorData.error;
							} else if (errorData.message) {
								errorMessage = errorData.message;
							}
							
							errorDetails.apiError = errorData;
						} catch {
							errorDetails.rawResponse = error.response.data;
						}
					}
				}

				if (this.continueOnFail()) {
					returnData.push({
						json: { 
							error: errorMessage,
							errorDetails,
						},
						pairedItem: itemIndex,
					});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), errorMessage, {
						itemIndex,
						description: errorDetails,
					});
				}
			}
		}

		return [returnData];
	}
}
