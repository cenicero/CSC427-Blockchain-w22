# CSC427 Blockchain Demo

## Installation

You will need a machine with npm and node.js installed.

1. Clone the repository to your machine
2. In a terminal, cd into the repository
3. Install all of the node dependencies using `npm install`
4. Set up a .env file. The .env should contain three environment variables: `IP=<IP>`, `PORT=<port>` and `FOLDER_NAME=<name of a folder in the repo to hold blockchain info>`. For the folder name one, you will want to create a new folder as well. There is also an optional environment variable you may want to set up if you want to run two processes of the main program at the same time: `BACKUP_PORT=<second port>`
5. Run the program by using `node blockchain_node.js`

## Files

There are three files that you should concern yourselves with:

 - `blockchain_node.js`: The main program which manages the blockchain and network connections.
 - `blockchain_helper.js`: A helper file which bundles all of the blockchain classes and information. You should not run this with node by itself
 - `miner.js`: A supplementary program to help you mine a block for this blockchain. You should run this on another terminal later on.

You will inspect the code as part of the lab, and make sure you understand some important code.