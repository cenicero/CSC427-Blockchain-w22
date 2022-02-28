const net = require('net');
const crypto = require("crypto");
const fs = require("fs");
require('dotenv').config();
const { Blockchain } = require('./blockchain_helper');
//const { Miner } = require('./miner');
const readline = require('readline');
const PACKET_TYPES = {
	NEW_BLOCK: 0,
	GET_BLOCK: 1,
	GET_BLOCKCHAIN_LEN: 2,
	SEND_BLOCK: 3,
	SEND_BLOCKCHAIN_LEN: 4
}
let trace_flag = false;
var clientSocket = null;

let dotenv_required = {
	FOLDER_NAME: 'place your blocks',
	PORT: 'set up a socket server',
	IP: 'set up a socket server'
};

for(let param in dotenv_required){
	if(!(param in process.env)){
		console.log(`Please set up your .env file to contain a ${param} to ${dotenv_required[param]}`);
		process.exit(0);
	}
}

//TO-DO: nohup this process so it doesnt die on lab PCs when I stop the ssh connection to lab pcs
const allConnections = [];
var server = net.createServer((connection) => {
	console.log("[CHILD CONNECTION] New node connected from " + connection.remoteAddress + ":" + connection.remotePort);
	connection.bufs = [];
	allConnections.push(connection);

	connection.on('data', (data) => {
		trace(`Received data: ${data.join(',')}`);
		connection.bufs.push(data);
		connection.check_for_complete_data();
	});

	connection.check_for_complete_data = function(){
		let buf = Buffer.concat(connection.bufs);
		let packet_type = buf.readUInt8(0);
		let packet_data = buf.subarray(1);
		let packet_len = 0;
		switch(packet_type){
			case PACKET_TYPES.NEW_BLOCK:
				packet_len = 48;
				break;

			case PACKET_TYPES.GET_BLOCK:
				packet_len = 4;
				break;

			case PACKET_TYPES.GET_BLOCKCHAIN_LEN:
				packet_len = 0;
				break;

			default:
				// Invalid data, reset data
				connection.bufs = [];
				return;
		}

		if(packet_data.length >= packet_len){
			let real_packet_data = buf.subarray(1, packet_len+1);
			connection.process_packet(packet_type,real_packet_data);

			// Keep the rest of the data and see if there is another packet in it
			let rest_of_data = buf.subarray(packet_len+1);
			if(rest_of_data.length > 0){
				connection.bufs = [rest_of_data];
				connection.check_for_complete_data();
			}else{
				connection.bufs = [];
			}
		}
	}

	connection.process_packet = function(packet_type, packet_data){
		switch(packet_type){
			case PACKET_TYPES.NEW_BLOCK:
				var block_n = packet_data.readUInt32BE(0);
				var block_data = packet_data.subarray(4);
				// Ignore all blocks if we obviously cannot add it
				if(block_n !== blockchain.get_blockchain_length())break;
				
				var add_res = blockchain.add_block(block_data);
				// Broadcast the block to everyone else if we added it to our blockchain
				
				console.log("===== NEW BLOCK FROM A NODE! =====");
				var new_block_packet = Buffer.alloc(49);
				new_block_packet.writeUInt8(packet_type);
				packet_data.copy(new_block_packet,1);
				broadcast_all(new_block_packet);
				
				break;

			case PACKET_TYPES.GET_BLOCK:
				var block_n = packet_data.readUInt32BE(0);
				// Get the n-th block, and check it is not null (which would mean it does not exist)
				var block_data = blockchain.get_block(block_n);
				if(block_data === null)break;
				trace(`Sending block ${block_n} to a child node. The block data is:\n${block_data.join(',')}`);
				// Send the block back to the requester
				var respond_buffer = Buffer.alloc(49);
				respond_buffer.writeUInt8(PACKET_TYPES.SEND_BLOCK, 0);
				respond_buffer.writeUInt32BE(block_n, 1);
				block_data.copy(respond_buffer, 5);
				connection.write(respond_buffer);
				break;

			case PACKET_TYPES.GET_BLOCKCHAIN_LEN:
				// Send two bytes: One with the outgoing packet type, the other is the blockchain length
				var respond_buffer = Buffer.alloc(5);
				respond_buffer.writeUInt8(PACKET_TYPES.SEND_BLOCKCHAIN_LEN, 0);
				respond_buffer.writeUInt32BE(blockchain.get_blockchain_length(), 1);
				connection.write(respond_buffer);
				break;

			default:
				// Either we don't recognize the packet, or we are deliberately ignoring it
				break;
		}

	}

	connection.on('close', () => {
		console.log(`[CHILD CONNECTION] Node ${connection.remoteAddress}:${connection.remotePort} disconnected`);
		allConnections.splice(allConnections.indexOf(connection,1));
	});

	connection.on('error', (e) => {
		console.log("[PARENT CONNECTION] We had an error");
	});
});

const blockchain = new Blockchain(process.env.FOLDER_NAME, trace_flag);
blockchain.import_blocks('blocks');


server.listen(process.env.PORT, process.env.IP, () => {
	console.log("Blockchain node server is listening on " , server.address())
	main();
});

let attempted_backup_port = false;
server.on('error',(e)=>{
	if(e.code === 'EADDRINUSE'){
		if(!attempted_backup_port && process.env.BACKUP_PORT){
			console.log("Couldn't set up server with main port, attempting backup port");
			attempted_backup_port = true;
			server.close();
			server.listen(process.env.BACKUP_PORT, process.env.IP, () => {
				console.log("Blockchain node server is listening on " , server.address())
				main();
			});
		}else{
			console.log("Couldn't set up server");
			process.exit();
		}
	}else{
		throw e;
	}
})


let readlineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

function setup_connection(IP, PORT){
	clientSocket = net.Socket({allowHalfOpen: true});
	clientSocket.connect(parseInt(PORT), IP);
	clientSocket.import_blocks_info = null;

	clientSocket.on('connect', () => {
		console.log("[PARENT CONNECTION] Connection successfully established");
		clientSocket.bufs = [];
		main();
	});

	clientSocket.on('close', () => {
		console.log("[PARENT CONNECTION] Connection closed");
		clientSocket = null;
	});

	clientSocket.on('data', (data) => {
		trace(`Received data: ${data.join(',')}`);
		clientSocket.bufs.push(data);
		clientSocket.check_for_complete_data();
	});

	clientSocket.on('error', (e) => {
		console.log("[PARENT CONNECTION] We had an error");
	});

	clientSocket.check_for_complete_data = function(){
		let buf = Buffer.concat(clientSocket.bufs);
		let packet_type = buf.readUInt8(0);
		let packet_data = buf.subarray(1);
		let packet_len = 0;
		switch(packet_type){
			case PACKET_TYPES.NEW_BLOCK:
				packet_len = 48;
				break;

			case PACKET_TYPES.SEND_BLOCK:
				packet_len = 48;
				break;

			case PACKET_TYPES.SEND_BLOCKCHAIN_LEN:
				packet_len = 4;
				break;

			default:
				// Invalid data
				clientSocket.bufs = [];
				return;
		}

		if(packet_data.length >= packet_len){
			let real_packet_data = buf.subarray(1, packet_len+1);
			clientSocket.process_packet(packet_type,real_packet_data);

			// Keep the rest of the data and see if there is another packet in it
			let rest_of_data = buf.subarray(packet_len+1);
			if(rest_of_data.length > 0){
				clientSocket.bufs = [rest_of_data];
				clientSocket.check_for_complete_data();
			}else{
				clientSocket.bufs = [];
			}
		}
	}

	clientSocket.process_packet = function(packet_type, packet_data){
		trace(`Process packet type ${packet_type}`);
		switch(packet_type){
			case PACKET_TYPES.NEW_BLOCK:
				var block_n = packet_data.readUInt32BE(0);
				var block_data = packet_data.subarray(4);
				// Ignore all blocks if we obviously cannot add it
				if(block_n !== blockchain.get_blockchain_length())break;

				var add_res = blockchain.add_block(block_data);
				// Broadcast the block to everyone else
				
				console.log("===== NEW BLOCK FROM A NODE! =====");
				var new_block_packet = Buffer.alloc(49);
				new_block_packet.writeUInt8(packet_type);
				packet_data.copy(new_block_packet,1);
				broadcast_all(new_block_packet);
				
				break;

			case PACKET_TYPES.SEND_BLOCKCHAIN_LEN:
				var packet_blockchain_len = packet_data.readUInt32BE(0);
				var current_blockchain_len = blockchain.get_blockchain_length();
				if(current_blockchain_len < packet_blockchain_len){
					// Get the new blocks from the server we're connected to
					clientSocket.import_blocks_info = {
						expecting_block: current_blockchain_len,
						total_blockchain_size: packet_blockchain_len
					}
					clientSocket.import_next_block();
				}else{
					console.log(`[UPDATE] We're already up to date`);
				}
				break;

			case PACKET_TYPES.SEND_BLOCK:
				// Check that we are expecting blocks as part of the update process.
				if(clientSocket.import_blocks_info === null)break;

				// Break it apart into block id and the block data
				var block_n = packet_data.readUInt32BE(0);
				var block_data = packet_data.subarray(4);
				// Verify that the this block is the one we expect to add to our blockchain
				if(block_n === clientSocket.import_blocks_info.expecting_block){
					console.log(`[UPDATE] Received block ${block_n}, attempting to insert it`);
					let add_res = blockchain.add_block(block_data);
					clientSocket.import_blocks_info.expecting_block++;
					clientSocket.import_next_block();
				}else{
					// Unexpected error
					console.log(`[UPDATE] Received a block we did not expect, halting the update process (Stopped at ${clientSocket.import_blocks_info.expecting_block}/${clientSocket.import_blocks_info.total_blockchain_size})`);
					clientSocket.import_blocks_info = null;
				}
				break;

			default:
				break;
		}
	}

	clientSocket.import_next_block = () => {
		// Check if we're expecting blocks
		if(clientSocket.import_blocks_info === null)return;

		// Check if we are done importing blocks
		if(clientSocket.import_blocks_info.expecting_block >= clientSocket.import_blocks_info.total_blockchain_size){
			console.log(`[UPDATE] Finished updating the blockchain!`);
			clientSocket.import_blocks_info = null;
			return;
		}

		// Request the next block
		console.log(`[UPDATE] Attempting to get block ${clientSocket.import_blocks_info.expecting_block}`);
		let get_block_packet = Buffer.alloc(5);
		get_block_packet.writeUInt8(PACKET_TYPES.GET_BLOCK, 0);
		get_block_packet.writeUInt32BE(clientSocket.import_blocks_info.expecting_block, 1);
		clientSocket.write(get_block_packet);
	}

	clientSocket.send_update_packet = () => {
		// Ask the parent node what the length of their blockchain is, so we can begin the process of updating
		let respond_buffer = Buffer.alloc(1);
		respond_buffer.writeUInt8(PACKET_TYPES.GET_BLOCKCHAIN_LEN, 0);
		clientSocket.write(respond_buffer);
	}
}

function broadcast_all(packet){
	// Broadcast a packet (Buffer) to ALL connections, this includes the parent node
	// and all child nodes.
	trace(`Broadcasting a packet to parent socket and ${allConnections.length} children nodes\n${packet.join(',')}`);
	if(clientSocket !== null){
		clientSocket.write(packet);
	}
	allConnections.forEach((c) => {
		c.write(packet);
	});
}

function trace(msg){
	if(trace_flag)console.log(`[TRACE] ${msg}`);
}

function main(){
	readlineInterface.question(`Input command (type 'help' for commands, or 'quit' to quit): `, (command) => {
		switch(command){
			case "help":
				console.log("==== List of commands ====");
				let commands_help = {
					connect: 'Connect to a blockchain network node',
					prep_mine: 'Get the previous block hash so you can begin mining using miner.js',
					process_mine: 'Process a block that you mined yourself and broadcast it to everyone',
					update: 'Force update your blockchain by getting new blocks from a parent node',
					wipe: 'Delete your blockchain... just in case',
					print: 'Print the contents of the blockchain (most recent "n" or "all")',
					trace: 'Enable/disable debug tracing',
					quit: 'Stop the process'
				}
				for(let cmd in commands_help){
					console.log(`${cmd}: ${commands_help[cmd]}`);
				}
				console.log(`==========================`);
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
							console.log("Error setting up the socket", e);
							clientSocket = null;
							main();
						}
					});
				});
				break;

			case "prep_mine":
				console.log("Prev hash hex: " + blockchain.get_prev_block_hash());
				console.log("Start mining by running 'node miner.js' in a new process. I highly recommend keeping this process alive while connected to the network so your blockchain stays in sync");
				break;

			case "process_mine":
				let hex_block = "";
				try{
					hex_block = fs.readFileSync('./mined_block.txt','utf8');
				}catch(e){
					console.log("You have not mined a block yet, start with command 'prep_mine'");
					console.log(e);
					break;
				}
				var block_buffer = blockchain.block_solution_to_buffer(hex_block);
				var block_n = blockchain.get_blockchain_length();
				var add_res = blockchain.add_block(block_buffer);
				if(add_res){
					// Send the new block to everyone on the network
					console.log("** CONGRATULATIONS ** The block you mined looks valid! Broadcasting to all nodes in the network...");
					console.log("NOTE: This is not a guarantee that the rest of the nodes will accept your block. Confirm with other nodes!")
					var block_buffer_packet = Buffer.alloc(49);
					block_buffer_packet.writeUInt8(PACKET_TYPES.NEW_BLOCK, 0);
					block_buffer_packet.writeUInt32BE(block_n, 1);
					block_buffer.copy(block_buffer_packet,5);
					broadcast_all(block_buffer_packet);
				}else{
					console.log("Oh noes! The block you mined does not appear to be valid... maybe new blocks came in?");
				}
				break;

			case "update":
				if(clientSocket === null){
					console.log("You need to be directly connected to a parent node. Use the connect command.");
				}else{
					if(clientSocket.import_blocks_info !== null){
						console.log("You are already updating your blockchain, please wait")
					}else{
						clientSocket.send_update_packet();
					}
				}
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

			case "print":
				readlineInterface.question('How many blocks would you like to see? (an integer for most recent n blocks, or "all") ', (res) => {
					if(res === 'all'){
						console.log(`========= BLOCKCHAIN CONTENTS =========`);
						blockchain.print_all();
					}else{
						var i = parseInt(res);
						if(!isNaN(i) && i > 0){
							blockchain.print_last_n(i);
						}else{
							console.log(`Invalid answer: ${res}`);
						}
					}
					main();
				});
				break;

			case "trace":
				trace_flag = !trace_flag;
				console.log(`Toggled trace to ${trace_flag}`);
				blockchain.set_trace(trace_flag);
				break;

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