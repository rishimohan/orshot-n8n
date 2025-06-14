import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { Buffer } from 'buffer';

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
		version: 1,
		description: 'Render images from templates using Orshot API',
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
				displayName: 'API Endpoint',
				name: 'apiEndpoint',
				type: 'options',
				default: 'https://api.orshot.com/v1/generate/images',
        options: [{
          name: 'api.orshot.com/v1/generate/images',
          value: 'https://api.orshot.com/v1/generate/images',
          description: 'Generate images from a libray template',
        },
        {
          name: 'api.orshot.com/v1/studio/render',
          value: 'https://api.orshot.com/v1/studio/render',
          description: 'Generate images from a custom studio template',
        }],
				required: true,
				description: 'Orshot API Endpoint URL(ref: https://orshot.com/docs/api-reference)',
			},
			{
				displayName: 'Template Name or ID',
				name: 'templateId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTemplates',
				},
        displayOptions: {
          show: {
            apiEndpoint: ['https://api.orshot.com/v1/generate/images'],
          },
        },
				default: '',
				required: true,
				description: 'Select the template to render from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
        displayOptions: {
          show: {
            apiEndpoint: ['https://api.orshot.com/v1/studio/render'],
          },
        },
				default: '',
				required: true,
				description: 'Enter the ID of the studio template to render. You can find this on the template playground page.',
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
				displayName: 'Modifications',
				name: 'modifications',
				type: 'fixedCollection',
				placeholder: 'Add Modification',
				default: {},
        displayOptions: {
          show: {
            apiEndpoint: ['https://api.orshot.com/v1/generate/images'],
          },
        },
				typeOptions: {
					multipleValues: true,
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
				name: 'modifications',
				type: 'fixedCollection',
				placeholder: 'Add Modification',
				default: {},
        displayOptions: {
          show: {
            apiEndpoint: ['https://api.orshot.com/v1/studio/render'],
          },
        },
				typeOptions: {
					multipleValues: true,
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
					const credentials = await this.getCredentials('orshotApi');
					const apiKey = credentials.token as string;

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: 'https://api.orshot.com/v1/templates',
						headers: {
							'Authorization': `Bearer ${apiKey}`,
							'Content-Type': 'application/json',
						},
					});

					const templates = Array.isArray(response) ? response : [];
					
					return templates.map((template: any) => ({
						name: `${template.title} - ${template.description}`,
						value: template.id,
					}));
				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load templates: ${error.message}`);
				}
			},
			async getLibraryTemplateModifications(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const templateId = this.getCurrentNodeParameter('templateId') as string;
					if (!templateId) {
						return [];
					}

					const credentials = await this.getCredentials('orshotApi');
					const apiKey = credentials.token as string;

					// First try to get template details from the templates endpoint
					const templatesResponse = await this.helpers.httpRequest({
						method: 'GET',
						url: 'https://api.orshot.com/v1/templates',
						headers: {
							'Authorization': `Bearer ${apiKey}`,
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
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `https://api.orshot.com/v1/templates/modifications?template_id=${templateId}`,
						headers: {
							'Authorization': `Bearer ${apiKey}`,
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
			},
			async getStudioTemplateModifications(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const templateId = this.getCurrentNodeParameter('templateId') as string;
					if (!templateId) {
						return [];
					}

					const credentials = await this.getCredentials('orshotApi');
					const apiKey = credentials.token as string;

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `https://api.orshot.com/v1/studio/template/modifications?templateId=${templateId}`,
						headers: {
							'Authorization': `Bearer ${apiKey}`,
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
				const credentials = await this.getCredentials('orshotApi');
				const apiKey = credentials.token as string;
				const apiEndpoint = this.getNodeParameter('apiEndpoint', itemIndex, '') as string;
				const templateId = this.getNodeParameter('templateId', itemIndex, '') as string;
				const responseType = this.getNodeParameter('responseType', itemIndex, '') as string;
				const responseFormat = this.getNodeParameter('responseFormat', itemIndex, '') as string;
				const modificationsData = this.getNodeParameter('modifications', itemIndex, {}) as any;

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
				const requestBody = {
					templateId,
					modifications,
					source: 'n8n-integration',
					response: {
						format: responseFormat,
						type: responseType,
					},
				};

				// Make the API request
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: apiEndpoint,
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
					},
					body: requestBody,
					returnFullResponse: true,
					encoding: responseType === 'binary' ? 'arraybuffer' : 'text',
				});

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
						outputData.data = Buffer.from(response.body as ArrayBuffer);
						outputData.mimeType = getMimeType(responseFormat);
						break;
					case 'url':
						outputData.data = response.body;
						break;
					default:
						outputData.data = response.body;
				}

				returnData.push({
					json: outputData,
					pairedItem: itemIndex,
				});

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { 
							error: error.message,
							templateId: this.getNodeParameter('templateId', itemIndex, '') as string,
						},
						pairedItem: itemIndex,
					});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
