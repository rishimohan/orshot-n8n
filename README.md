# n8n-nodes-orshot

This is an n8n community node for [Orshot](https://orshot.com), the API for automated image, PDF and video generation from templates.

Design a template once in Orshot Studio (or import it from Canva or Figma), then automate image, PDF and video generation from any n8n workflow: pass your data in, get a rendered file or hosted URL back.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials) <!-- delete if no auth needed -->  
[Compatibility](#compatibility)  
[Usage](#usage) <!-- delete if not using this section -->  
[Resources](#resources)  
[Version history](#version-history) <!-- delete if not using this section -->

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

- Render from a Studio Template: images (PNG, JPG, WebP), PDFs and videos (MP4, WebM, GIF), with Smart Resize, PDF and video options
- Wait for Completion (Async): render long videos and large PDFs in the background without timeouts
- Render from a Library Template
- Publish to Social Media (post or schedule content to your connected social accounts)
- Get Brand Assets (fetch your workspace brand kit: images, colors, fonts, videos, audio)

## Credentials

- You need an API Key for this integration to work
- You can get an free API Key by signing up on [Orshot](https://orshot.com)
- After signing up, you can head to your Workspace > Settings > API Key to get your API Key
- You can use that API Key in the "Token" field in the n8n Integration

## Compatibility

- Works on n8n > 1.00
- Created on n8n v1.94.1, tested on n8n v2.48.7

## Usage

You can refer to [Orshot API Docs](https://orshot.com/docs) to refer to the APIs and their usage along with definitions, examples etc.

## Resources

- [API Docs](https://orshot.com/docs)
- [Library Templates](https://orshot.com/templates)
- [Creating a custom API template using Orshot Studio](https://orshot.com/features/orshot-studio)
- [Creating a template using AI Template Generator](https://orshot.com/features/ai-template-generator)
- [Integrations](https://orshot.com/integrations)

## Version history

#### 0.7.0

- Errors now say what Orshot said and what to do next. A refused request used to show n8n's generic "Forbidden - perhaps check your credentials?" or "Bad request"; it now shows the API's own message (out of credits, feature not on the plan, wrong API key, rate limit, template not found) with the fix under it. "Continue On Fail" items carry the same message, status and help link
- PDF with the Base64 response type returned corrupted data; it now returns the PDF
- New node version 5: Base64 returns the base64 string itself (a list of pages for multi-page templates) instead of the API response as text. Versions 3 and 4 keep their output, so saved workflows are unchanged
- From node version 5, Binary output uses "Custom File Name" when it is set
- "Additional Sizes" with the Binary response type is refused up front with the reason
- From node version 5, videos render in the background and wait for the result by default, so long videos no longer time out
- Publish to Social Media: a post that failed on some accounts, or is still publishing, now says so on the item (`failedPlatforms`, `message`)
- Template and field dropdowns show the API's error text, and untitled templates are listed with their ID
- The render operations are now named "Render a Library Template" and "Render a Studio Template" (they produce PDFs and videos too, not only images). Saved workflows are unaffected
- The node can be found in the nodes panel by what it makes: image, pdf, video, certificate, invoice, og image and more
- Added guidance for n8n's AI workflow builder on when to use the node and how to fill it in
- Moved to n8n's current community node tooling (`n8n-node lint`); the node still loads on older n8n versions

#### 0.6.3

- Fixed packaging: 0.6.0-0.6.2 were published without compiled code, so their features never reached users. The build now always emits the node and refuses to publish an empty package
- Added "Wait for Completion (Async)" for studio renders: runs long videos and large PDFs as background jobs and polls until done (off by default)
- Added PDF image compression options (JPEG re-encode, max DPI, quality)
- PDF and video options are now sent where the API reads them, so settings like CMYK, DPI, loop and mute take effect

#### 0.6.0

- Added Smart Resize for studio templates: "Resize To" option with 28 presets (Instagram Story, OG Image, etc.) or a custom WIDTHxHEIGHT
- Added "Additional Sizes" option to render extra sized copies of the same design in one call (returned in the `extraSizes` array on the response)
- New operation: Publish to Social Media - post or schedule renders to connected social accounts, with drafts, timezone and TikTok settings
- New operation: Get Brand Assets - fetch your workspace brand kit (images, colors, fonts, videos, audio) with optional tag filter
- New nodes default to URL response type (existing nodes keep their behavior via node versioning)
- Response formats are now scoped per operation (video/GIF only for studio templates)
- Template dropdown loads all templates via pagination and shows template IDs
- Modification dropdown shows unique keys with their current default value; one modification row is pre-added
- PDF, video and file name options appear based on the selected response format

#### 0.5.0

- Added support for Video generation (`mp4`, `webm`, `gif`) for studio templates
- Added support for PDF options (`dpi`, `margin`, `colorMode`, `pageRange`)
- Added support for Video options (`loop`, `muted`, `trimStart`, `trimEnd`)

#### 0.4.1

- Added support for `includePages` param for studio templates

#### 0.4.0

- Added support for `customFileName` and `scale` params for studio templates

#### 0.3.5

- Fixes image generation for "binary" response types

#### 0.3.0

- Add correct link to n8n Ingegration doc
- Show descriptions in studio templates dropdown list

#### 0.2.5

- Automatically show dropdown of user's studio templates(previously user needed to enter it manually)

#### 0.2.0

- Make repo public and trigger vertification check

#### 0.1.0

- Initial Release
- Actions for rendering from a library and studio template
