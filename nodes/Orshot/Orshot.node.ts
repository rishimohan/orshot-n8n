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
		mp4: 'video/mp4',
		webm: 'video/webm',
		gif: 'image/gif',
	};
	return mimeTypes[format] || 'application/octet-stream';
};

// Smart Resize presets supported by the render API's response.size /
// response.extraSizes (kept in sync with Orshot's ADAPTIVE_SIZE_PRESETS)
const SIZE_PRESET_OPTIONS = [
	{ name: 'A4 Document (2480x3508)', value: 'a4-document' },
	{ name: 'Blog Header (1200x630)', value: 'blog-header' },
	{ name: 'Business Card (1050x600)', value: 'business-card' },
	{ name: 'Email Header (600x200)', value: 'email-header' },
	{ name: 'Facebook Cover Photo (851x315)', value: 'facebook-cover' },
	{ name: 'Facebook Post (1200x630)', value: 'facebook-post' },
	{ name: 'Facebook Story (1080x1920)', value: 'facebook-story' },
	{ name: 'Instagram Post (Landscape) (1080x566)', value: 'instagram-post-landscape' },
	{ name: 'Instagram Post (Portrait) (1080x1350)', value: 'instagram-post-portrait' },
	{ name: 'Instagram Post (Square) (1080x1080)', value: 'instagram-post' },
	{ name: 'Instagram Story/Reel (1080x1920)', value: 'instagram-story' },
	{ name: 'Leaderboard Ad (728x90)', value: 'leaderboard-ad' },
	{ name: 'LinkedIn Banner (1584x396)', value: 'linkedin-banner' },
	{ name: 'LinkedIn Post (1200x627)', value: 'linkedin-post' },
	{ name: 'Medium Rectangle Ad (300x250)', value: 'medium-rectangle-ad' },
	{ name: 'Open Graph Image (1200x630)', value: 'og-image' },
	{ name: 'Pinterest Pin (1000x1500)', value: 'pinterest-pin' },
	{ name: 'Presentation 16:9 (1920x1080)', value: 'presentation-16-9' },
	{ name: 'TikTok Video (1080x1920)', value: 'tiktok-video' },
	{ name: 'Twitter/X Header (1500x500)', value: 'twitter-header' },
	{ name: 'Twitter/X Post (1200x675)', value: 'twitter-post' },
	{ name: 'US Letter (2550x3300)', value: 'us-letter' },
	{ name: 'Website Banner (1920x600)', value: 'website-banner' },
	{ name: 'WhatsApp Status (1080x1920)', value: 'whatsapp-status' },
	{ name: 'YouTube Short (1080x1920)', value: 'youtube-short' },
	{ name: 'YouTube Thumbnail (1280x720)', value: 'youtube-thumbnail' },
	{ name: 'Zoom Background (1920x1080)', value: 'zoom-background' },
];

const LIBRARY_RENDER_OP = 'https://api.orshot.com/v1/generate/images';
const STUDIO_RENDER_OP = 'https://api.orshot.com/v1/studio/render';
const SOCIAL_PUBLISH_OP = 'socialPublish';
const BRAND_ASSETS_OP = 'brandAssets';

const parseJsonOption = (value: any): { invalid?: boolean; value?: any } => {
	if (value === undefined || value === null || value === '') return {};
	if (typeof value === 'object') return { value };
	try {
		return { value: JSON.parse(value as string) };
	} catch {
		return { invalid: true };
	}
};

export class Orshot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Orshot',
		name: 'orshot',
		group: ['transform'],
		icon: 'file:orshot.svg',
    documentationUrl: 'https://el.orshot.com/n8n-docs',
		version: [3, 4],
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
        // eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
        options: [{
          name: 'Generate Image From an Orshot Studio Template',
          value: 'https://api.orshot.com/v1/studio/render',
          description: 'Render a template you designed in Orshot Studio',
          action: 'Generate an image from a studio template',
        },
        {
          name: 'Generate Image From a Library Template',
          value: 'https://api.orshot.com/v1/generate/images',
          description: 'Render a pre-designed template from the Orshot library',
          action: 'Generate an image from a library template',
        },
        {
          name: 'Get Brand Assets',
          value: 'brandAssets',
          description: 'Fetch your workspace brand kit (images, colors, fonts, videos, audio)',
          action: 'Get brand assets',
        },
        {
          name: 'Publish to Social Media',
          value: 'socialPublish',
          description: 'Post or schedule content to your connected social media accounts',
          action: 'Publish to social media',
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
				displayName: 'Response Format',
				name: 'responseFormat',
				type: 'options',
				options: [
          {
            name: 'GIF',
            value: 'gif',
            description: 'Animated GIF',
          },
          {
            name: 'JPEG',
            value: 'jpeg',
          },
          {
            name: 'JPG',
            value: 'jpg',
          },
          {
            name: 'MP4',
            value: 'mp4',
            description: 'Video',
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
            name: 'WebM',
            value: 'webm',
            description: 'Video',
          },
          {
            name: 'WebP',
            value: 'webp',
          },
        ],
				default: 'png',
				required: true,
				displayOptions: {
					show: {
						operation: ['https://api.orshot.com/v1/studio/render'],
					},
				},
				description: 'Format of the rendered output',
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
				displayOptions: {
					show: {
						operation: ['https://api.orshot.com/v1/generate/images'],
					},
				},
				description: 'Format of the rendered output',
			},
			{
				displayName: 'Response Type',
				name: 'responseType',
				type: 'options',
				// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
				options: [
					{
						name: 'URL',
						value: 'url',
						description: 'Hosted URL of the generated file (easiest to pass to other nodes)',
					},
					{
						name: 'Base64',
						value: 'base64',
						description: 'Raw base64 string of the file in the JSON output',
					},
					{
						name: 'Binary',
						value: 'binary',
						description: 'N8n binary data (for upload or attachment nodes)',
					},
				],
				default: 'url',
				required: true,
				displayOptions: {
					show: {
						'@version': [{ _cnd: { gte: 4 } }],
						operation: [
							'https://api.orshot.com/v1/generate/images',
							'https://api.orshot.com/v1/studio/render',
						],
					},
					hide: {
						responseFormat: ['mp4', 'webm', 'gif'],
					},
				},
				description: 'How the generated file is returned',
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
				displayOptions: {
					show: {
						'@version': [3],
						operation: [
							'https://api.orshot.com/v1/generate/images',
							'https://api.orshot.com/v1/studio/render',
						],
					},
					hide: {
						responseFormat: ['mp4', 'webm', 'gif'],
					},
				},
				description: 'Type of response to return',
			},
			{
				displayName: 'Response Type',
				name: 'responseTypeVideo',
				type: 'options',
				options: [
					{
						name: 'URL',
						value: 'url',
					},
				],
				default: 'url',
				required: true,
				displayOptions: {
					show: {
						operation: [
							'https://api.orshot.com/v1/generate/images',
							'https://api.orshot.com/v1/studio/render',
						],
						responseFormat: ['mp4', 'webm', 'gif'],
					},
				},
				description: 'Video formats are always returned as a URL',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: [
							'https://api.orshot.com/v1/generate/images',
							'https://api.orshot.com/v1/studio/render',
						],
					},
				},
				options: [
					{
						displayName: 'Additional Custom Sizes',
						name: 'extraCustomSizes',
						type: 'string',
						displayOptions: {
							show: {
								extraSizes: ['custom'],
							},
						},
						default: '',
						placeholder: '800x600, 1200x1200',
						description: 'Comma-separated list of custom WIDTHxHEIGHT sizes to render alongside the main output',
					},
					{
						displayName: 'Additional Sizes',
						name: 'extraSizes',
						type: 'multiOptions',
						// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
						options: [
							{
								name: 'Custom Sizes (Enter Below)',
								value: 'custom',
								description: 'Add custom WIDTHxHEIGHT sizes',
							},
							...SIZE_PRESET_OPTIONS,
						],
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
							},
							hide: {
								'/responseFormat': ['mp4', 'webm', 'gif'],
							},
						},
						default: [],
						description: 'Smart Resize: also render the design at these sizes in the same call. Each output includes an "extraSizes" array with a URL per size. Image and PDF formats only.',
					},
					{
						displayName: 'Custom File Name',
						name: 'customFileName',
						type: 'string',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseType': ['url', 'binary'],
							},
						},
						default: '',
						description: 'Custom file name for the output file (without extension). Works only with URL or Binary response types.',
					},
					{
						displayName: 'Include Pages',
						name: 'includePages',
						type: 'string',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
							},
						},
						default: '',
						placeholder: '1,3,5',
						description: 'Comma-separated list of page numbers to include (e.g., "1,3,5" will render pages 1, 3, and 5). Only works for multi-page templates. Leave empty to include all pages.',
					},
					{
						displayName: 'Loop Video',
						name: 'videoLoop',
						type: 'boolean',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['mp4', 'webm', 'gif'],
							},
						},
						default: false,
						description: 'Whether to loop the video',
					},
					{
						displayName: 'Mute Audio',
						name: 'videoMuted',
						type: 'boolean',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['mp4', 'webm', 'gif'],
							},
						},
						default: false,
						description: 'Whether to mute the audio in the video',
					},
					{
						displayName: 'Page Range From',
						name: 'pdfRangeFrom',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
							},
						},
						default: 0,
						description: 'Start page number for PDF export range',
					},
					{
						displayName: 'Page Range To',
						name: 'pdfRangeTo',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
							},
						},
						default: 0,
						description: 'End page number for PDF export range',
					},
					{
						displayName: 'PDF Color Mode',
						name: 'pdfColorMode',
						type: 'options',
						options: [
							{
								name: 'RGB',
								value: 'rgb',
							},
							{
								name: 'CMYK',
								value: 'cmyk',
							},
						],
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
							},
						},
						default: 'rgb',
						description: 'Color mode for the PDF output',
					},
					{
						displayName: 'PDF Margin',
						name: 'pdfMargin',
						type: 'string',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
							},
						},
						default: '',
						placeholder: '20px',
						description: 'Margin for the PDF pages (e.g., "20px", "1in")',
					},
					{
						displayName: 'PDF Quality (DPI)',
						name: 'pdfDpi',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
							},
						},
						default: 72,
						description: 'DPI for the PDF output (72 is standard, 300 for print)',
					},
					{
						displayName: 'Resize To',
						name: 'resizeTo',
						type: 'options',
						// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
						options: [
							{
								name: 'Custom Size (Enter Below)',
								value: 'custom',
								description: 'Enter a custom WIDTHxHEIGHT size',
							},
							...SIZE_PRESET_OPTIONS,
						],
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
							},
						},
						// 'instagram-story' is inside the spread SIZE_PRESET_OPTIONS, which the lint rule can't see
						// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-options
						default: 'instagram-story',
						description: 'Smart Resize: render this design at a different size. The layout automatically adapts to fit the new dimensions.',
					},
					{
						displayName: 'Resize To Custom Size',
						name: 'resizeCustomSize',
						type: 'string',
						displayOptions: {
							show: {
								resizeTo: ['custom'],
							},
						},
						default: '',
						placeholder: '1080x1920',
						description: 'Custom size as WIDTHxHEIGHT in pixels',
					},
					{
						displayName: 'Scale',
						name: 'scale',
						type: 'number',
						default: 1,
						typeOptions: {
							minValue: 0.1,
							maxValue: 10,
							numberPrecision: 1,
						},
						description: 'Scale factor for the rendered output (0.1 to 10)',
					},
					{
						displayName: 'Trim End (Seconds)',
						name: 'videoTrimEnd',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['mp4', 'webm', 'gif'],
							},
						},
						default: 0,
						description: 'End time in seconds to trim the video',
					},
					{
						displayName: 'Trim Start (Seconds)',
						name: 'videoTrimStart',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['mp4', 'webm', 'gif'],
							},
						},
						default: 0,
						description: 'Start time in seconds to trim the video',
					},
				],
			},
			{
				displayName: 'Modifications',
				name: 'libraryModifications',
				type: 'fixedCollection',
				placeholder: 'Add Modification',
				default: { modification: [{ key: '', value: '' }] },
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
								placeholder: 'Leave empty to use the template default',
								description: 'New value for this key. If left empty, the key is not sent and the template renders with its saved default (shown under the key in the dropdown).',
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
				default: { modification: [{ key: '', value: '' }] },
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
								placeholder: 'Leave empty to use the template default',
								description: 'New value for this key. If left empty, the key is not sent and the template renders with its saved default (shown under the key in the dropdown).',
							},
						],
					},
				],
				description: 'Template modifications to apply. Select a modification key and enter its value.',
			},
			{
				displayName: 'Social Account Names or IDs',
				name: 'socialAccounts',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getSocialAccounts',
				},
				default: [],
				required: true,
				displayOptions: {
					show: {
						operation: ['socialPublish'],
					},
				},
				description: 'Social accounts to publish to. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Post Content',
				name: 'socialContent',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				displayOptions: {
					show: {
						operation: ['socialPublish'],
					},
				},
				description: 'Caption/text of the post (max 5000 characters)',
			},
			{
				displayName: 'Media URLs',
				name: 'socialMediaUrls',
				type: 'string',
				default: '',
				placeholder: 'https://storage.orshot.com/...png, https://...',
				displayOptions: {
					show: {
						operation: ['socialPublish'],
					},
				},
				description: 'Comma-separated image/video URLs to attach. Tip: chain an Orshot render operation with Response Type "URL" and reference its output here.',
			},
			{
				displayName: 'Schedule At',
				name: 'socialScheduledFor',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						operation: ['socialPublish'],
					},
				},
				description: 'When to publish the post. Leave empty to publish immediately.',
			},
			{
				displayName: 'Options',
				name: 'socialOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['socialPublish'],
					},
				},
				options: [
					{
						displayName: 'Platform Options',
						name: 'platformOptions',
						type: 'json',
						default: '',
						description: 'Advanced per-platform publishing options as JSON',
					},
					{
						displayName: 'Save as Draft',
						name: 'isDraft',
						type: 'boolean',
						default: false,
						description: 'Whether to save the post as a draft instead of publishing it',
					},
					{
						displayName: 'TikTok Settings',
						name: 'tiktokSettings',
						type: 'json',
						default: '',
						description: 'TikTok-specific settings as JSON (camelCase keys)',
					},
					{
						displayName: 'Timezone',
						name: 'timezone',
						type: 'string',
						default: '',
						placeholder: 'Europe/Amsterdam',
						description: 'Timezone used for the scheduled time',
					},
				],
			},
			{
				displayName: 'Asset Type',
				name: 'brandAssetType',
				type: 'options',
				options: [
					{
						name: 'All',
						value: 'all',
					},
					{
						name: 'Audio',
						value: 'audio',
					},
					{
						name: 'Colors',
						value: 'colors',
					},
					{
						name: 'Fonts',
						value: 'fonts',
					},
					{
						name: 'Images',
						value: 'images',
					},
					{
						name: 'Videos',
						value: 'videos',
					},
				],
				default: 'all',
				displayOptions: {
					show: {
						operation: ['brandAssets'],
					},
				},
				description: 'Which brand kit assets to fetch',
			},
			{
				displayName: 'Filter by Tag',
				name: 'brandAssetTag',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['brandAssets'],
					},
				},
				description: 'Only return assets with this tag. Leave empty to return all assets.',
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
							description: `ID: ${template.id}`,
						}));
					} catch (error) {
						throw new NodeOperationError(this.getNode(), `Failed to load templates: ${error.message}`);
					}
				},
				async getStudioTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
					try {
						// Paginated endpoint — aggregate all pages so every template
						// shows up in the dropdown (40 per page, hard cap 50 pages)
						const templates: any[] = [];
						let page = 1;
						while (page <= 50) {
							const response = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
								method: 'GET',
								url: `https://api.orshot.com/v1/studio/templates/all?page=${page}&limit=40`,
								headers: {
									'Content-Type': 'application/json',
								},
							});

							const pageTemplates = Array.isArray(response?.data) ? response.data : [];
							templates.push(...pageTemplates);

							const totalPages = response?.pagination?.totalPages || 1;
							if (page >= totalPages || pageTemplates.length === 0) break;
							page++;
						}

						return templates.map((template: any) => ({
							name: `${template.name}`,
							value: template.id,
							description: `ID: ${template.id}`,
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
								name: modification.key,
								value: modification.key,
								description: modification.description || '',
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
							name: modification.key,
							value: modification.key,
							description: modification.description || '',
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

						return modifications.map((modification: any) => {
							// Show the param's current/default value as the subtitle —
							// far more recognizable than a generic type description
							const example = `${modification.example ?? ''}`.replace(/\s+/g, ' ').trim();
							const preview = example.length > 60 ? `${example.slice(0, 57)}...` : example;
							return {
								name: modification.id,
								value: modification.id,
								description: preview ? `Default: ${preview}` : modification.description || '',
							};
						});
					} catch (error) {
						// Return empty array instead of throwing error to avoid breaking the UI
						return [{
							name: `Error: ${error.message}`,
							value: 'error',
						}];
					}
				},
				async getSocialAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
					try {
						const response = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
							method: 'GET',
							url: 'https://api.orshot.com/v1/social/accounts',
							headers: {
								'Content-Type': 'application/json',
							},
						});

						const accounts = Array.isArray(response?.data) ? response.data : [];

						if (accounts.length === 0) {
							return [{
								name: 'No Connected Accounts Found — Connect One in Orshot First',
								value: '',
							}];
						}

						return accounts.map((account: any) => {
							const platform = account.platform
								? account.platform.charAt(0).toUpperCase() + account.platform.slice(1)
								: 'Account';
							const handle = account.account_username
								? `@${account.account_username}`
								: account.account_name || account.id;
							return {
								name: `${platform}: ${handle}`,
								value: account.id,
								description: account.account_name || '',
							};
						});
					} catch (error) {
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

				// ── Publish to Social Media ──────────────────────────────────
				if (operation === SOCIAL_PUBLISH_OP) {
					const accounts = (this.getNodeParameter('socialAccounts', itemIndex, []) as string[]).filter(
						(id) => id && id !== 'error',
					);
					if (accounts.length === 0) {
						throw new NodeOperationError(this.getNode(), 'Select at least one social account to publish to', {
							itemIndex,
						});
					}

					const content = this.getNodeParameter('socialContent', itemIndex, '') as string;
					const mediaUrlsRaw = this.getNodeParameter('socialMediaUrls', itemIndex, '') as string;
					const scheduledFor = this.getNodeParameter('socialScheduledFor', itemIndex, '') as string;
					const socialOptions = this.getNodeParameter('socialOptions', itemIndex, {}) as any;

					const mediaUrls = mediaUrlsRaw
						.split(',')
						.map((url: string) => url.trim())
						.filter((url: string) => url !== '');

					const body: any = { accounts };
					if (content) body.content = content;
					if (mediaUrls.length > 0) body.media_urls = mediaUrls;
					if (scheduledFor) {
						body.schedule = { scheduledFor: new Date(scheduledFor).toISOString() };
					}
					if (socialOptions.timezone) body.timezone = socialOptions.timezone;
					if (socialOptions.isDraft) body.isDraft = true;
					const platformOptions = parseJsonOption(socialOptions.platformOptions);
					if (platformOptions.invalid) {
						throw new NodeOperationError(this.getNode(), 'Platform Options must be valid JSON', { itemIndex });
					}
					if (platformOptions.value !== undefined) body.platformOptions = platformOptions.value;
					const tiktokSettings = parseJsonOption(socialOptions.tiktokSettings);
					if (tiktokSettings.invalid) {
						throw new NodeOperationError(this.getNode(), 'TikTok Settings must be valid JSON', { itemIndex });
					}
					if (tiktokSettings.value !== undefined) body.tiktokSettings = tiktokSettings.value;

					const publishResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
						method: 'POST',
						url: 'https://api.orshot.com/v1/social/publish',
						headers: {
							'Content-Type': 'application/json',
						},
						body,
					});

					const publishData = publishResponse?.data ?? publishResponse;
					returnData.push({
						json: publishData && typeof publishData === 'object' ? publishData : { data: publishData },
						pairedItem: itemIndex,
					});
					continue;
				}

				// ── Get Brand Assets ─────────────────────────────────────────
				if (operation === BRAND_ASSETS_OP) {
					const assetType = this.getNodeParameter('brandAssetType', itemIndex, 'all') as string;
					const tag = (this.getNodeParameter('brandAssetTag', itemIndex, '') as string).trim();
					const assetTypes = assetType === 'all' ? ['images', 'colors', 'fonts', 'videos', 'audio'] : [assetType];
					const query = tag ? `?tag=${encodeURIComponent(tag)}` : '';

					const assetResults = await Promise.all(
						assetTypes.map(async (type: string) => {
							const assetResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
								method: 'GET',
								url: `https://api.orshot.com/v1/brand-assets/${type}/get${query}`,
								headers: {
									'Content-Type': 'application/json',
								},
							});
							return { type, data: assetResponse?.data ?? assetResponse };
						}),
					);

					const assets: any = {};
					for (const result of assetResults) {
						assets[result.type] = result.data;
					}

					returnData.push({
						json: assets,
						pairedItem: itemIndex,
					});
					continue;
				}
				
				// Get the correct templateId based on the operation
				let templateId = '';
				if (operation === LIBRARY_RENDER_OP) {
					templateId = this.getNodeParameter('libraryTemplateId', itemIndex, '') as string;
				} else if (operation === STUDIO_RENDER_OP) {
					templateId = this.getNodeParameter('studioTemplateId', itemIndex, '') as string;
				}
				
				const responseFormat = this.getNodeParameter('responseFormat', itemIndex, '') as string;
				
				let responseType: string;
				if (['mp4', 'webm', 'gif'].includes(responseFormat)) {
					responseType = 'url';
				} else {
					responseType = this.getNodeParameter('responseType', itemIndex, '') as string;
				}
				
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
				
				// Get collection options
				const options = this.getNodeParameter('options', itemIndex, {}) as any;

				// Add scale parameter (works for both library and studio templates)
				const scale = options.scale as number;
				if (scale && scale !== 1) {
					requestBody.response.scale = scale;
				}

				// Add studio-specific parameters
				if (operation === 'https://api.orshot.com/v1/studio/render') {
					const customFileName = options.customFileName as string;
					const includePages = options.includePages as string;

					// Smart Resize: replace size (response.size)
					const resizeTo = (options.resizeTo as string) || '';
					const resizeSize =
						resizeTo === 'custom' ? ((options.resizeCustomSize as string) || '').trim() : resizeTo;
					if (resizeSize) {
						requestBody.response.size = resizeSize;
					}

					// Smart Resize: additional sizes (response.extraSizes) — image/PDF only.
					// 'custom' is the "Custom Sizes (Enter Below)" toggle, not a real size.
					const extraSizePresets = ((options.extraSizes as string[]) || []).filter(
						(size) => size !== '' && size !== 'custom',
					);
					const extraCustomSizes = ((options.extraCustomSizes as string) || '')
						.split(',')
						.map((size: string) => size.trim())
						.filter((size: string) => size !== '');
					const allExtraSizes = [...extraSizePresets, ...extraCustomSizes];
					if (allExtraSizes.length > 0 && !['mp4', 'webm', 'gif'].includes(responseFormat)) {
						requestBody.response.extraSizes = allExtraSizes;
					}

					if (customFileName && (responseType === 'url' || responseType === 'binary')) {
						requestBody.response.fileName = customFileName;
					}

					if (includePages && includePages.trim() !== '') {
						// Parse comma-separated page numbers
						const pageNumbers = includePages
							.split(',')
							.map((p: string) => p.trim())
							.filter((p: string) => p !== '')
							.map((p: string) => parseInt(p, 10))
							.filter((p: number) => !isNaN(p) && p > 0);
						
						if (pageNumbers.length > 0) {
							requestBody.response.includePages = pageNumbers;
						}
					}

					// Process PDF Options
					if (responseFormat === 'pdf') {
						const pdfOptions: any = {};
						if (options.pdfDpi) pdfOptions.dpi = options.pdfDpi;
						if (options.pdfMargin) pdfOptions.margin = options.pdfMargin;
						if (options.pdfColorMode) pdfOptions.colorMode = options.pdfColorMode;
						if (options.pdfRangeFrom) pdfOptions.rangeFrom = options.pdfRangeFrom;
						
						let pdfRangeTo = options.pdfRangeTo as number;
						
						// If pdfRangeTo is not set (0), fetch template details to set it to max pages
						if (!pdfRangeTo || pdfRangeTo === 0) {
							try {
								const templatesResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'orshotApi', {
									method: 'GET',
									url: 'https://api.orshot.com/v1/studio/templates',
									headers: {
										'Content-Type': 'application/json',
									},
								});
								
								const templates = Array.isArray(templatesResponse) ? templatesResponse : [];
								// templateId can be string or number, ensure comparison works
								const currentTemplate = templates.find((t: any) => String(t.id) === String(templateId));
								
								if (currentTemplate && currentTemplate.pages_data && Array.isArray(currentTemplate.pages_data)) {
									pdfRangeTo = currentTemplate.pages_data.length;
								}
							} catch (error) {
								// Ignore error and continue without setting default range
							}
						}
						
						if (pdfRangeTo) pdfOptions.rangeTo = pdfRangeTo;
						
						if (Object.keys(pdfOptions).length > 0) {
							requestBody.response.pdfOptions = pdfOptions;
						}
					}
					
					// Process Video Options
					if (['mp4', 'webm', 'gif'].includes(responseFormat)) {
						const videoOptions: any = {};
						if (options.videoLoop) videoOptions.loop = options.videoLoop;
						if (options.videoMuted) videoOptions.muted = options.videoMuted;
						if (options.videoTrimStart) videoOptions.trimStart = options.videoTrimStart;
						if (options.videoTrimEnd) videoOptions.trimEnd = options.videoTrimEnd;
						
						if (Object.keys(videoOptions).length > 0) {
							requestBody.response.videoOptions = videoOptions;
						}
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
				let templateId = '';
				if (operation === LIBRARY_RENDER_OP) {
					templateId = this.getNodeParameter('libraryTemplateId', itemIndex, '') as string;
				} else if (operation === STUDIO_RENDER_OP) {
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
