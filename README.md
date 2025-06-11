## Local setup

Install n8n locally.

Build the node

`npm run build`

`npm link`

navigate to `~/.n8n/custom`.

If `custom` directory doesn't exist create it and run `npm init` (Use all default values when prompted)

Run this command in `~/.n8n/custom` directory

`npm link n8n-nodes-orshot`

Start your local n8n instance `n8n start`

You should be able to see orshot node
