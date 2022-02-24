const net = require('net');
const crypto = require("crypto");
const fs = require("fs");
require('dotenv').config();
const { Blockchain } = require('./blockchain');
//const { Miner } = require('./miner');
const readline = require('readline');
const PACKET_TYPES = {
	NEW_BLOCK: 0,
	GET_BLOCK: 1,
	GET_BLOCKCHAIN_LEN: 2,
	SEND_BLOCK: 3,
	SEND_BLOCKCHAIN_LEN: 4
}
const trace = true;
var clientSocket = null;

let dotenv_required = {
	FOLDER_NAME: 'place your blocks',
	PORT: 'set up a socket server'
};

for(let param in dotenv_required){
	if(!(param in process.env)){
		console.log(`Please set up your .env file to contain a ${param} to ${dotenv_required[param]}`);
		process.exit(0);
	}
}

var server = net.createServer((connection) => {
	console.log("[NEW CONNECTION] New node connected from " + connection.remoteAddress);
	connection.bufs = [];
	connection.setEncoding(null);

	connection.on('data', (data) => {
		connection.bufs.push(data)
	});

	connection.on('end', () => {
		//Concat the entire message into one buffer
		let buf = Buffer.concat(connection.bufs);
		connection.bufs = [];
		let packet_type = buf[0];
		let packet_data = buf.subarray(1);
		// The first byte tells us what type of packet it is
		switch(packet_type){
			case PACKET_TYPES.NEW_BLOCK:
				// Verify that the packet data is exactly 44 bytes, if it does, try to add it to our blockchain
				if(packet_data.length !== 44)break;
				blockchain.add_block(packet_data);
				break;
			case PACKET_TYPES.GET_BLOCK:
				break;
			case PACKET_TYPES.GET_BLOCKCHAIN_LEN:
				// Send two bytes: One with the outgoing packet type, the other is the blockchain length
				let respond_buffer = Buffer.alloc(5);
				respond_buffer.writeUInt8(PACKET_TYPES.SEND_BLOCKCHAIN_LEN);
				respond_buffer.writeUInt32BE(blockchain.get_blockchain_length());
				connection.write(respond_buffer);
				break;
			default:
				// Either we don't recognize the packet, or we are deliberately ignoring it
				break;
		}
	});

	connection.on('close', () => {
		console.log("[SEVERED CONNECTION] Node " + connection.remoteAddress + " disconnected");
	});
});

const blockchain = new Blockchain(process.env.FOLDER_NAME, trace);
//let miner = null;
blockchain.import_blocks('blocks');
blockchain.print_all();
console.log(blockchain.get_prev_block_hash())

server.listen(process.env.PORT, () => {
	console.log("Blockchain node server is listening")
	main();
});

let readlineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

function setup_connection(IP, PORT){
	clientSocket = net.Socket({allowHalfOpen: true});
	clientSocket.setEncoding(null);
	clientSocket.connect(Integer.parseInt(PORT), IP);
	

	clientSocket.on('connect', () => {
		console.log("[PARENT CONNECTION] Connection successfully established");
		clientSocket.bufs = [];
	});

	clientSocket.on('close', () => {
		console.log("[PARENT CONNECTION] Connection closed");
		clientSocket = null;
	});

	clientSocket.on('data', (data) => {
		clientSocket.bufs.push(data);
	});

	clientSocket.on('end', () => {
		let buf = Buffer.concat(clientSocket.bufs);
		clientSocket.bufs = [];
		let packet_type = buf[0];
		let packet_data = buf.subarray(1);
		switch(packet_type){
			case PACKET_TYPES.NEW_BLOCK:
				// Verify that the packet data is exactly 44 bytes, if it does, try to add it to our blockchain
				if(packet_data.length !== 44)break;
				blockchain.add_block(packet_data);
				break; 
			case PACKET_TYPES.SEND_BLOCKCHAIN_LEN:
				if(packet_data.length !== 4)break;
				let packet_blockchain_len = packet_data.readUInt32BE();
				let current_blockchain_len = blockchain.get_blockchain_length();
				if(current_blockchain_len < packet_blockchain_len){
					// Get the new blocks from the server we're connected to
					for(let i = current_blockchain_len; i < packet_blockchain_len; i++){
						let get_block_packet = Buffer.alloc(5);
						get_block_packet.writeUInt8(PACKET_TYPES.GET_BLOCK);
						get_block_packet.writeUInt32BE(i);
						clientSocket.write(get_block_packet);
					}
				}
				break;
			case PACKET_TYPES.SEND_BLOCK:
				// Verify that the packet data is exactly 44 bytes, if it does, try to add it to our blockchain
				if(packet_data.length !== 44)break;
				blockchain.add_block(packet_data);
				break;
			default:
				break;
		}
	});
}

function main(){
	readlineInterface.question(`Input command (type 'help' for commands): `, (command) => {
		switch(command){
			case "help":
				console.log("List of commands\n---------------");
				let commands_help = {
					connect: 'Connect to a blockchain network node',
					prep_mine: 'Get the previous black hash so you can begin mining using miner.js',
					insert_block: 'Read in a block that you mined yourself and broadcast it to everyone',
					update: 'Force update your blockchain by getting new blocks from a node',
					wipe: 'Delete your blockchain',
					quit: 'Stop the process'
				}
				for(let cmd in commands_help){
					console.log(`${cmd}: ${commands_help[cmd]}`);
				}
				break;

			case "connect":
				if(clientSocket !== null){
					console.log("You're already connected to node");
					break;
				}
				readlineInterface.question('IP to connect to: ', (IP) => {
					readlineInterface.question('Port to connect to: ', (PORT) => {
						try{
							setup_connection(IP, PORT);
						}catch(e){
							console.log("Error setting up the socket");
						}
					});
				});
				break;

			case "prep_mine":
				console.log("Prev hash hex: " + blockchain.get_prev_block_hash());
				console.log("Start mining by running 'node miner.js' in a new process. I highly recommend keeping this process alive while connected to the network so your blockchain stays in sync");
				break;

			case "insert_block":
				// TO-DO, verify that you're connected to another node first
				let hex_block = "";
				try{
					hex_block = fs.readFileSync('./mined_block.txt','utf8');
				}catch(e){
					console.log("You have not mined a block yet, start with command 'prep_mine'");
					console.log(e);
					break;
				}
				let block_buffer = blockchain.block_solution_to_buffer(hex_block);
				blockchain.add_block(block_buffer);
				break;

			case "update":
				console.log("not done yet");
				break;

			case "wipe":
				readlineInterface.question('Are you sure you want to wipe? Type "yes" exactly: ', (res) => {
					if(res === 'yes'){
						blockchain.wipe();
					}else{
						console.log("Didn't read \"yes\", aborting wipe");
					}
					main();
				});
				break;

			/*case "trace":
				trace = !trace;
				console.log(`Toggled trace to ${trace}`);
				blockchain.set_trace(trace);
				break;*/

			case "quit":
				console.log("Leaving the network");
				process.exit(0);

			default:
				console.log(`Unrecognized command '${command}'`);
				break;

		}
		main();
	})
}