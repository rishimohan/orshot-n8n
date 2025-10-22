# n8n-nodes-orshot

This is an n8n community node. It lets you use [Orshot](https://orshot.com)'s Image Generation API in your n8n workflows.

Orshot is an Image Generation API which lets you generate dynamic images from pre-designed and AI generated templates via API and Integrations.

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

- Generate Images from a Library Template
- Generate Images from a Orshot Studio Templates

## Credentials

- You need an API Key for this integration to work
- You can get an free API Key by signing up on [Orshot](https://orshot.com)
- After signing up, you can head to your Workspace > Settings > API Key to get your API Key
- You can use that API Key in the "Token" field in the n8n Integration

## Compatibility

- Works on n8n > 1.00
- Created on n8n v1.94.1

## Usage

You can refer to [Orshot API Docs](https://orshot.com/docs) to refer to the APIs and their usage along with definitions, examples etc.

## Resources

- [API Docs](https://orshot.com/docs)
- [Library Templates](https://orshot.com/templates)
- [Creating a custom API template using Orshot Studio](https://orshot.com/features/orshot-studio)
- [Creating a template using AI Template Generator](https://orshot.com/features/ai-template-generator)
- [Integrations](https://orshot.com/integrations)

## Version history

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
