import type {
	NodeConnectionType,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription, JsonObject
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

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

const parseJsonOption = (value: unknown): { invalid?: boolean; value?: IDataObject } => {
	if (value === undefined || value === null || value === '') return {};
	if (typeof value === 'object') return { value: value as IDataObject };
	try {
		return { value: JSON.parse(value as string) };
	} catch {
		return { invalid: true };
	}
};

const VIDEO_FORMATS = ['mp4', 'webm', 'gif'];

// n8n before 1.9x has no NodeConnectionTypes export, and this node still has to
// load there, so fall back to the value it stands for.
const MAIN_CONNECTION: NodeConnectionType = NodeConnectionTypes?.Main ?? 'main';

type OrshotContext = IExecuteFunctions | ILoadOptionsFunctions;

// What orshotRequest learned from a refused request, kept on the error for
// the "Continue On Fail" item.
type OrshotApiError = NodeApiError & {
	orshot?: { status: number; code?: string; helpUrl: string; hint: string };
};

// The response body as text, whatever the transport handed back (a Buffer or
// ArrayBuffer for renders, a string or parsed object elsewhere).
const bodyToText = (body: unknown): string => {
	if (body === undefined || body === null) return '';
	if (typeof body === 'string') return body;
	if (Buffer.isBuffer(body)) return body.toString('utf8');
	if (body instanceof ArrayBuffer) return Buffer.from(body).toString('utf8');
	try {
		return JSON.stringify(body);
	} catch {
		return '';
	}
};

// API payloads are JSON of a shape this file reads field by field.
const asObject = (value: unknown): IDataObject =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as IDataObject) : {};

const asList = (value: unknown): IDataObject[] =>
	Array.isArray(value) ? (value as IDataObject[]) : [];

const bodyToJson = (body: unknown): unknown => {
	if (body && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof ArrayBuffer)) {
		return body;
	}
	try {
		return JSON.parse(bodyToText(body));
	} catch {
		return undefined;
	}
};

const bodyToBuffer = (body: unknown): Buffer => {
	if (Buffer.isBuffer(body)) return body;
	if (body instanceof ArrayBuffer) return Buffer.from(body);
	return Buffer.from(bodyToText(body), 'utf8');
};

const stripDataUri = (content: unknown): string => {
	const text = typeof content === 'string' ? content : '';
	return text.startsWith('data:') ? text.slice(text.indexOf(',') + 1) : text;
};

// What the person can do about a refused request. The API's own sentence is the
// error message; this is the line under it.
const TIMEOUT_STATUSES = [408, 502, 503, 504, 520, 522, 524];

const errorHint = (
	status: number,
	apiMessage: string,
	isRender: boolean,
	hasApiMessage: boolean,
): string => {
	const text = apiMessage.toLowerCase();
	if (status === 429) {
		return 'Too many requests in a short time. Add a Wait node between items or lower the batch size, then run again.';
	}
	if (status === 401 || text.includes('api key')) {
		return 'Check the API key saved in this node\'s Orshot credential. Copy a key from your Orshot workspace settings, and make sure it belongs to the workspace that owns the template.';
	}
	if (text.includes('credit') || text.includes('render limit')) {
		return 'This workspace has used its credits for the period. Renders work again when the credits reset, or right away on a bigger plan: https://orshot.com/pricing';
	}
	if (text.includes('supported plans')) {
		return 'This feature is not part of the workspace\'s current plan. See https://orshot.com/pricing';
	}
	// The API answers a missing template with 403 or 400 as well as 404.
	if (status === 404 || (text.includes('template') && text.includes('not found'))) {
		return 'Check the template selected in this node. It may have been deleted, or it belongs to a different workspace than the API key.';
	}
	if (TIMEOUT_STATUSES.includes(status)) {
		return isRender
			? 'The render took longer than a single request allows. Under Options, turn on "Wait for Completion (Async)" and set Response Type to URL, then run again.'
			: 'Orshot did not answer in time. Run the node again in a moment.';
	}
	// A 5xx that arrives with Orshot's own sentence already says what failed.
	if (status >= 500 && !hasApiMessage) {
		return 'Orshot hit an error on its side. Run the node again; if it keeps failing, contact support at https://orshot.com/contact';
	}
	return '';
};

/**
 * Every call to the Orshot API goes through here. n8n's request helper throws
 * on a 4xx/5xx with its own generic text ("Forbidden - perhaps check your
 * credentials?") and drops the response body, which is where Orshot says what
 * went wrong ("free credits for this month reached", "Video generation is
 * available on supported plans"). So read the status ourselves and raise the
 * API's sentence, plus what to do about it.
 */
async function orshotRequest(
	ctx: OrshotContext,
	requestOptions: IHttpRequestOptions,
	extra: { itemIndex?: number; isRender?: boolean } = {},
): Promise<{ statusCode: number; body: unknown; headers: IDataObject }> {
	const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'orshotApi', {
		...requestOptions,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});

	const statusCode = Number(response?.statusCode) || 0;
	if (statusCode >= 200 && statusCode < 300) {
		return { statusCode, body: response.body, headers: (response.headers || {}) as IDataObject };
	}

	const parsed = bodyToJson(response?.body);
	const apiError = asObject(parsed);
	// Social refusals carry a short `error` and the full sentence in `message`.
	const apiText = [apiError.error, apiError.message]
		.filter((part) => typeof part === 'string' && part)
		.join('. ');
	const apiMessage =
		apiText ||
		(TIMEOUT_STATUSES.includes(statusCode)
			? `Orshot did not finish the request in time (HTTP ${statusCode})`
			: `Orshot returned HTTP ${statusCode} with no explanation`);
	const hint = errorHint(statusCode, apiMessage, extra.isRender === true, Boolean(apiText));
	const helpUrl = typeof apiError.helpUrl === 'string' ? apiError.helpUrl : '';
	const description = [hint, helpUrl ? `Details: ${helpUrl}` : ''].filter(Boolean).join(' ');

	const error = new NodeApiError(
		ctx.getNode(),
		{
			message: apiMessage,
			httpStatus: statusCode,
			...(apiError.code ? { code: apiError.code } : {}),
			...(helpUrl ? { helpUrl } : {}),
		} as JsonObject,
		{
			message: apiMessage,
			description: description || undefined,
			httpCode: String(statusCode),
			itemIndex: extra.itemIndex,
		},
	);
	(error as OrshotApiError).orshot = { status: statusCode, code: apiError.code as string | undefined, helpUrl, hint };
	throw error;
}

export class Orshot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Orshot',
		name: 'orshot',
		group: ['transform'],
		icon: { light: 'file:orshot.svg', dark: 'file:orshot.dark.svg' },
		subtitle:
			'={{ $parameter["operation"] === "https://api.orshot.com/v1/generate/images" ? "Library Template" : $parameter["operation"] === "https://api.orshot.com/v1/studio/render" ? "Studio Template" : $parameter["operation"] === "brandAssets" ? "Brand Assets" : "Publish to Social Media" }}',
    documentationUrl: 'https://el.orshot.com/n8n-docs',
		version: [3, 4, 5],
		description: 'Automate image, PDF and video generation from templates via the Orshot API',
		defaults: {
			name: 'Orshot',
		},
		inputs: [MAIN_CONNECTION],
		outputs: [MAIN_CONNECTION],
		usableAsTool: true,
		// Read by n8n's AI workflow builder when it picks and configures nodes.
		builderHint: {
			searchHint:
				'Use Orshot to turn data into a finished image, PDF or video from a reusable template: social posts, ad creatives, certificates, invoices, reports and video clips. Pick "Render a Studio Template" for a template the user designed (it supports video and multi-page output) and "Render a Library Template" for a ready-made one. The values that change per run go under Modifications, one entry per dynamic field of the template. Set Response Type to URL when the next node needs a link (posting to social media, sending in an email or chat message) and Binary when it needs the file itself (upload or attachment nodes). "Publish to Social Media" posts a rendered URL to the social accounts connected in Orshot.',
		},
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
          name: 'Render a Library Template',
          value: 'https://api.orshot.com/v1/generate/images',
          description: 'Generate an image or PDF from a ready-made template in the Orshot library',
          action: 'Render a library template',
        },
        {
          name: 'Render a Studio Template',
          value: 'https://api.orshot.com/v1/studio/render',
          description: 'Generate an image, PDF or video from a template you designed in Orshot Studio',
          action: 'Render a studio template',
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
				builderHint: {
					propertyHint:
						'The ID of a template in the user\'s Orshot workspace. Ask the user which template to render; never invent an ID.',
					placeholderSupported: true,
				},
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
				options: [
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
					{
						name: 'URL',
						value: 'url',
						description: 'Hosted URL of the generated file (easiest to pass to other nodes)',
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
						displayName: 'Async Poll Interval (Seconds)',
						name: 'asyncPollInterval',
						type: 'number',
						typeOptions: {
							minValue: 2,
							maxValue: 60,
						},
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								waitForCompletion: [true],
							},
						},
						default: 5,
						description: 'How often to check whether the background render has finished',
					},
					{
						displayName: 'Async Timeout (Minutes)',
						name: 'asyncTimeoutMinutes',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 60,
						},
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								waitForCompletion: [true],
							},
						},
						default: 15,
						description: 'Stop waiting and fail the item after this long. The render keeps running and can still be fetched by its job ID.',
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
						displayName: 'PDF Image Compression',
						name: 'pdfImageFormat',
						type: 'options',
						options: [
							{
								name: 'Auto',
								value: 'auto',
								description: 'Leave embedded images exactly as the renderer produced them',
							},
							{
								name: 'JPEG',
								value: 'jpeg',
								description: 'Re-encode embedded photos as JPEG, usually 80-90% smaller',
							},
						],
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
							},
						},
						default: 'auto',
						description: 'How embedded images are compressed in the PDF',
					},
					{
						displayName: 'PDF Image Max DPI',
						name: 'pdfMaxImageDpi',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
								pdfImageFormat: ['jpeg'],
							},
						},
						default: 300,
						description: 'Downsample embedded images above this resolution. Use 0 to keep the source resolution.',
					},
					{
						displayName: 'PDF Image Quality',
						name: 'pdfImageQuality',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 100,
						},
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
								'/responseFormat': ['pdf'],
								pdfImageFormat: ['jpeg'],
							},
						},
						default: 85,
						description: 'JPEG quality from 1 to 100. 85 is print quality.',
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
						// Defaults to the custom-size toggle: with no custom size entered the
						// design renders at its original size, so adding this option is a no-op
						// until the user picks a preset or types a size.
						default: 'custom',
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
					{
						displayName: 'Wait for Completion (Async)',
						name: 'waitForCompletion',
						type: 'boolean',
						displayOptions: {
							show: {
								'/operation': ['https://api.orshot.com/v1/studio/render'],
							},
						},
						default: false,
						description: 'Whether to render in the background and wait for the result. Use this for long videos or large multi-page PDFs that would otherwise time out. Requires the URL response type. Videos render this way by default; switch it off to render a video in a single request.',
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
						const { body: response } = await orshotRequest(this, {
							method: 'GET',
							url: 'https://api.orshot.com/v1/templates',
							json: true,
						});

						return asList(response).map((template: IDataObject) => ({
							name: `${template.title || template.id}`,
							value: template.id as string | number,
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
						const templates: IDataObject[] = [];
						let page = 1;
						while (page <= 50) {
							const { body: response } = await orshotRequest(this, {
								method: 'GET',
								url: `https://api.orshot.com/v1/studio/templates/all?page=${page}&limit=40`,
								json: true,
							});

							const pageTemplates = asList(asObject(response).data);
							templates.push(...pageTemplates);

							const totalPages = Number(asObject(asObject(response).pagination).totalPages) || 1;
							if (page >= totalPages || pageTemplates.length === 0) break;
							page++;
						}

						return templates.map((template: IDataObject) => ({
							name: `${template.name || `Untitled template (${template.id})`}`,
							value: template.id as string | number,
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
						const { body: templatesResponse } = await orshotRequest(this, {
							method: 'GET',
							url: 'https://api.orshot.com/v1/templates',
							json: true,
						});

						const selectedTemplate = asList(templatesResponse).find(
							(template: IDataObject) => template.id === templateId,
						);

						if (selectedTemplate && selectedTemplate.modifications) {
							return asList(selectedTemplate.modifications).map((modification: IDataObject) => ({
								name: `${modification.key}`,
								value: modification.key as string | number,
								description: `${modification.description || ''}`,
							}));
						}

						// Fallback to modifications endpoint if template doesn't have modifications
						const { body: response } = await orshotRequest(this, {
							method: 'GET',
							url: `https://api.orshot.com/v1/templates/modifications?templateId=${encodeURIComponent(templateId)}`,
							json: true,
						});

						return asList(response).map((modification: IDataObject) => ({
							name: `${modification.key}`,
							value: modification.key as string | number,
							description: `${modification.description || ''}`,
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

						const { body: response } = await orshotRequest(this, {
							method: 'GET',
							url: `https://api.orshot.com/v1/studio/template/modifications?templateId=${encodeURIComponent(templateId)}`,
							json: true,
						});

						return asList(response).map((modification: IDataObject) => {
							// Show the param's current/default value as the subtitle —
							// far more recognizable than a generic type description
							const example = `${modification.example ?? ''}`.replace(/\s+/g, ' ').trim();
							const preview = example.length > 60 ? `${example.slice(0, 57)}...` : example;
							return {
								name: `${modification.id}`,
								value: modification.id as string | number,
								description: preview ? `Default: ${preview}` : `${modification.description || ''}`,
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
						const { body: response } = await orshotRequest(this, {
							method: 'GET',
							url: 'https://api.orshot.com/v1/social/accounts',
							json: true,
						});

						const accounts = asList(asObject(response).data);

						if (accounts.length === 0) {
							return [{
								name: 'No Connected Accounts Found — Connect One in Orshot First',
								value: '',
							}];
						}

						return accounts.map((account: IDataObject) => {
							const platformName = `${account.platform || ''}`;
							const platform = platformName
								? platformName.charAt(0).toUpperCase() + platformName.slice(1)
								: 'Account';
							const handle = account.account_username
								? `@${account.account_username}`
								: account.account_name || account.id;
							return {
								name: `${platform}: ${handle}`,
								value: account.id as string | number,
								description: `${account.account_name || ''}`,
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
					const socialOptions = this.getNodeParameter('socialOptions', itemIndex, {}) as IDataObject;

					const mediaUrls = mediaUrlsRaw
						.split(',')
						.map((url: string) => url.trim())
						.filter((url: string) => url !== '');

					const body: IDataObject = { accounts };
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

					const { body: publishResponse } = await orshotRequest(
						this,
						{
							method: 'POST',
							url: 'https://api.orshot.com/v1/social/publish',
							body,
							json: true,
						},
						{ itemIndex },
					);

					const publishBody = asObject(publishResponse);
					const publishData = publishBody.data ?? publishResponse;
					const publishJson: IDataObject =
						publishData && typeof publishData === 'object'
							? { ...(publishData as IDataObject) }
							: { data: publishData as IDataObject };

					// A post can go out on some accounts and fail on others ("partial"), or
					// still be publishing when Orshot answers ("processing"). Neither is an
					// error to retry (a retry would post twice), so say it on the item where
					// the next node can branch on it.
					const failedPlatforms = asList(publishJson.platforms).filter(
						(entry: IDataObject) => entry?.status === 'failed' || entry?.error,
					);
					if (failedPlatforms.length > 0) {
						publishJson.failedPlatforms = failedPlatforms.map((entry: IDataObject) => ({
							platform: entry.platform,
							error: entry.error || 'Publishing failed',
						}));
						publishJson.message = `Not published on ${failedPlatforms
							.map((entry: IDataObject) => entry.platform)
							.filter(Boolean)
							.join(', ')}. The other accounts are done, so do not run this item again; fix the failed account in Orshot and republish the post there.`;
					} else if (publishJson.status === 'processing') {
						publishJson.message =
							(typeof publishBody.message === 'string' && publishBody.message) ||
							'Still publishing. Check the post in Orshot in a minute; do not publish it again.';
					}

					// Show it in the editor too, where a 200 would otherwise read as done.
					if (typeof publishJson.message === 'string' && typeof this.addExecutionHints === 'function') {
						this.addExecutionHints({
							message: publishJson.message,
							type: 'warning',
							location: 'outputPane',
						});
					}

					returnData.push({
						json: publishJson,
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
							const { body: assetResponse } = await orshotRequest(
								this,
								{
									method: 'GET',
									url: `https://api.orshot.com/v1/brand-assets/${type}/get${query}`,
									json: true,
								},
								{ itemIndex },
							);
							return { type, data: (asObject(assetResponse).data ?? assetResponse) as IDataObject };
						}),
					);

					const assets: IDataObject = {};
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
				const isVideoFormat = VIDEO_FORMATS.includes(responseFormat);
				const nodeVersion = this.getNode().typeVersion;
				if (isVideoFormat) {
					responseType = 'url';
				} else {
					responseType = this.getNodeParameter('responseType', itemIndex, '') as string;
				}
				
				// Get the modifications from the correct parameter based on operation
				let modificationsData: IDataObject;
				if (operation === 'https://api.orshot.com/v1/generate/images') {
					modificationsData = this.getNodeParameter('libraryModifications', itemIndex, {}) as IDataObject;
				} else {
					modificationsData = this.getNodeParameter('studioModifications', itemIndex, {}) as IDataObject;
				}

				// Convert fixedCollection format to object
				const modifications: IDataObject = {};
				asList(modificationsData.modification).forEach((mod: IDataObject) => {
					if (mod.key && mod.value !== undefined && mod.value !== '') {
						modifications[`${mod.key}`] = mod.value;
					}
				});

				// Prepare the request body
				const responseSpec: IDataObject = {
					format: responseFormat,
					type: responseType,
				};
				const requestBody: IDataObject = {
					templateId,
					modifications,
					source: 'n8n-integration',
					response: responseSpec,
				};
				
				// Get collection options
				const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

				// Add scale parameter (works for both library and studio templates)
				const scale = options.scale as number;
				if (scale && scale !== 1) {
					responseSpec.scale = scale;
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
						responseSpec.size = resizeSize;
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
					if (allExtraSizes.length > 0 && !isVideoFormat) {
						if (responseType === 'binary') {
							throw new NodeOperationError(
								this.getNode(),
								'"Additional Sizes" cannot be returned as Binary',
								{
									itemIndex,
									description:
										'A binary response holds one file, and Additional Sizes produces several. Set Response Type to URL (or Base64), or remove Additional Sizes.',
								},
							);
						}
						responseSpec.extraSizes = allExtraSizes;
					}

					if (customFileName && (responseType === 'url' || responseType === 'binary')) {
						responseSpec.fileName = customFileName;
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
							responseSpec.includePages = pageNumbers;
						}
					}

					// Process PDF Options
					if (responseFormat === 'pdf') {
						const pdfOptions: IDataObject = {};
						if (options.pdfDpi) pdfOptions.dpi = options.pdfDpi;
						if (options.pdfMargin) pdfOptions.margin = options.pdfMargin;
						if (options.pdfColorMode) pdfOptions.colorMode = options.pdfColorMode;
						if (options.pdfRangeFrom) pdfOptions.rangeFrom = options.pdfRangeFrom;
						if (options.pdfImageFormat && options.pdfImageFormat !== 'auto') {
							pdfOptions.imageFormat = options.pdfImageFormat;
							if (options.pdfImageQuality) pdfOptions.imageQuality = options.pdfImageQuality;
							// 0 is meaningful here (keep source resolution), so check for
							// undefined rather than truthiness.
							if (options.pdfMaxImageDpi !== undefined) {
								pdfOptions.maxImageDpi = options.pdfMaxImageDpi;
							}
						}

						// Send rangeTo ONLY when the user set it. This used to auto-fill it
						// with the template's page count whenever "Page Range From" was set,
						// which cost a templates fetch on every render and, now that
						// pdfOptions actually reaches the API, would turn "Page Range From: 2"
						// into pageRanges "2-N". The studio multi-page path renders one page
						// per document, so anything but a range starting at 1 fails the whole
						// render with "Page range exceeds page count". The auto-fill never had
						// any effect before (the options were dropped), so dropping it changes
						// nothing users have experienced and keeps this node's behaviour
						// identical to calling the REST API directly.
						if (options.pdfRangeTo) pdfOptions.rangeTo = options.pdfRangeTo;

						if (Object.keys(pdfOptions).length > 0) {
							// pdfOptions is a TOP-LEVEL request field. It was previously nested
							// under response, where the API never looked for it, so every PDF
							// option set in n8n was silently discarded.
							requestBody.pdfOptions = pdfOptions;
						}
					}
					
					// Process Video Options
					if (isVideoFormat) {
						const videoOptions: IDataObject = {};
						if (options.videoLoop) videoOptions.loop = options.videoLoop;
						if (options.videoMuted) videoOptions.muted = options.videoMuted;
						if (options.videoTrimStart) videoOptions.trimStart = options.videoTrimStart;
						if (options.videoTrimEnd) videoOptions.trimEnd = options.videoTrimEnd;
						
						if (Object.keys(videoOptions).length > 0) {
							// Same top-level placement as pdfOptions above.
							requestBody.videoOptions = videoOptions;
						}
					}
				}

				// Async mode (opt-in, off by default so existing workflows are untouched):
				// start a background render job and poll it until it finishes. Avoids
				// timeouts on long video / large PDF renders.
				// From node version 5, a video renders this way unless the option is
				// explicitly switched off: videos are the renders that outlast a single
				// request, and a timed-out request loses a render that still finished.
				const waitForCompletion =
					operation === 'https://api.orshot.com/v1/studio/render' &&
					(options.waitForCompletion === true ||
						(nodeVersion >= 5 && isVideoFormat && options.waitForCompletion !== false));
				let renderJobId: number | undefined;

				let response: { statusCode: number; body: unknown; headers: IDataObject };
				if (waitForCompletion) {
					if (responseType !== 'url') {
						throw new NodeOperationError(
							this.getNode(),
							'"Wait for Completion (Async)" needs Response Type set to "URL". Async renders return hosted URLs.',
							{ itemIndex },
						);
					}
					responseSpec.mode = 'async';

					const { body: startResponse } = await orshotRequest(
						this,
						{
							method: 'POST',
							url: operation,
							body: requestBody,
							json: true,
						},
						{ itemIndex, isRender: true },
					);
					let job = asObject(startResponse);
					renderJobId = typeof job.id === 'number' ? job.id : undefined;
					if (!renderJobId) {
						throw new NodeOperationError(this.getNode(), 'Orshot did not return a render job ID for the async render', {
							itemIndex,
						});
					}

					const pollSeconds = Math.min(Math.max(Number(options.asyncPollInterval) || 5, 2), 60);
					const timeoutMinutes = Math.min(Math.max(Number(options.asyncTimeoutMinutes) || 15, 1), 60);
					const deadline = Date.now() + timeoutMinutes * 60 * 1000;

					while (!job?.finished) {
						if (Date.now() > deadline) {
							throw new NodeOperationError(
								this.getNode(),
								`Render job ${renderJobId} did not finish within ${timeoutMinutes} minutes. It keeps running; fetch it later from GET https://api.orshot.com/v1/studio/render-jobs/${renderJobId}`,
								{ itemIndex },
							);
						}
						await sleep(pollSeconds * 1000);
						const polled = await orshotRequest(
							this,
							{
								method: 'GET',
								url: `https://api.orshot.com/v1/studio/render-jobs/${renderJobId}`,
								json: true,
							},
							{ itemIndex, isRender: true },
						);
						job = asObject(polled.body);
					}

					if (job.status !== 'succeeded') {
						throw new NodeOperationError(
							this.getNode(),
							job.error ? `${job.error}` : `Render job ${renderJobId} ${job.status}`,
							{
								itemIndex,
								description: `Render job ${renderJobId} ended as "${job.status}"${job.error_code ? ` (${job.error_code})` : ''}. Open the template in Orshot Studio to check it renders there, then run again.`,
							},
						);
					}

					// job.result is the exact body a synchronous render returns.
					response = { statusCode: 200, body: job.result, headers: {} };
				} else {
					// Always read the body as bytes: a PDF comes back as the file itself
					// whatever Response Type asks for, and reading that as text corrupts it.
					response = await orshotRequest(
						this,
						{
							method: 'POST',
							url: operation,
							headers: {
								'Content-Type': 'application/json',
							},
							body: requestBody,
							encoding: 'arraybuffer',
						},
						{ itemIndex, isRender: true },
					);
				}

				const outputData: IDataObject = {
					templateId,
					responseType,
					responseFormat,
					statusCode: response.statusCode,
					modifications: modifications,
				};
				if (renderJobId !== undefined) {
					outputData.renderJobId = renderJobId;
				}

				const contentType = `${response.headers?.['content-type'] ?? ''}`.toLowerCase();
				const isFileBody = !contentType.includes('json') && Boolean(contentType);

				// Handle different response types
				switch (responseType) {
					case 'base64': {
						const mimeType = getMimeType(responseFormat);
						outputData.mimeType = mimeType;

						if (isFileBody) {
							// PDF: the API answers with the file, not JSON.
							const fileBase64 = bodyToBuffer(response.body).toString('base64');
							outputData.data =
								nodeVersion >= 5
									? fileBase64
									: JSON.stringify({
											data: {
												content: `data:${mimeType};base64,${fileBase64}`,
												format: responseFormat,
												type: responseType,
											},
										});
							break;
						}

						if (nodeVersion < 5) {
							// Versions 3 and 4 always returned the API's JSON as text here;
							// saved workflows parse it, so it stays.
							outputData.data = bodyToText(response.body);
							break;
						}

						// Version 5: the base64 string itself, as the option says.
						const parsedBody = bodyToJson(response.body);
						const rendered = asObject(parsedBody).data;
						if (Array.isArray(rendered)) {
							outputData.data = asList(rendered).map((page: IDataObject) => ({
								page: page.page,
								data: stripDataUri(page.content),
								...(page.filename ? { fileName: page.filename } : {}),
							}));
							outputData.totalPages = rendered.length;
						} else if (rendered && typeof rendered === 'object') {
							const { content, filename, ...details } = rendered as IDataObject;
							outputData.data = stripDataUri(content);
							if (filename) outputData.fileName = filename;
							if (Object.keys(details).length > 0) outputData.details = details;
						} else {
							outputData.data = bodyToText(response.body);
						}
						break;
					}
					case 'binary': {
						// Use prepareBinaryData for proper binary handling
						// Version 5 only: earlier versions always named the file
						// "orshot-image", and saved workflows may look for that name.
						const customBinaryName =
							nodeVersion >= 5 && operation === STUDIO_RENDER_OP
								? `${options.customFileName ?? ''}`.trim()
								: '';
						const binaryData = await this.helpers.prepareBinaryData(
							bodyToBuffer(response.body),
							`${customBinaryName || 'orshot-image'}.${responseFormat}`,
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
					}
					case 'url':
						// URL responses are JSON; async renders already hand over an object.
						outputData.data = bodyToJson(response.body) ?? bodyToText(response.body);
						break;
					default:
						outputData.data = bodyToText(response.body);
				}

				returnData.push({
					json: outputData,
					pairedItem: itemIndex,
				});

			} catch (error) {
				// Enhanced error handling
				const errorMessage = error.message || 'Unknown error occurred';
				const operation = this.getNodeParameter('operation', itemIndex, '') as string;
				
				// Get the correct templateId based on the operation
				let templateId = '';
				if (operation === LIBRARY_RENDER_OP) {
					templateId = this.getNodeParameter('libraryTemplateId', itemIndex, '') as string;
				} else if (operation === STUDIO_RENDER_OP) {
					templateId = this.getNodeParameter('studioTemplateId', itemIndex, '') as string;
				}
				
				const errorDetails: IDataObject = {
					templateId,
					operation,
					timestamp: new Date().toISOString(),
				};

				// What orshotRequest learned from the API's answer.
				if (error.orshot) {
					errorDetails.httpStatus = error.orshot.status;
					if (error.orshot.code) errorDetails.code = error.orshot.code;
					if (error.orshot.helpUrl) errorDetails.helpUrl = error.orshot.helpUrl;
				}
				const errorHintText = typeof error.description === 'string' ? error.description : '';
				if (errorHintText) errorDetails.hint = errorHintText;

				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: errorMessage,
							errorDetails,
						},
						pairedItem: itemIndex,
					});
				} else {
					// One way out for every failure, carrying the message, what to do
					// about it, and the item it happened on.
					if (error instanceof NodeOperationError) {
						throw new NodeOperationError(this.getNode(), errorMessage, {
							itemIndex,
							description: errorHintText || undefined,
						});
					}
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						message: errorMessage,
						description: errorHintText || undefined,
						httpCode: error.httpCode ?? undefined,
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
