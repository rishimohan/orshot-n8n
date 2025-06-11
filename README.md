## Local setup

Install n8n locally. (https://docs.n8n.io/integrations/creating-nodes/test/run-node-locally/)

### Build the node

`npm run build`

`npm link`

### Adding Orshot node to your local n8n installation

navigate to `~/.n8n/custom`.

If `custom` directory doesn't exist create it and run `npm init` (Use all default values when prompted)

Run this command in `~/.n8n/custom` directory

`npm link n8n-nodes-orshot`

### Run local n8n

Start your local n8n instance `n8n start`

You should be able to see orshot node
