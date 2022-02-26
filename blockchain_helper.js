const crypto = require("crypto");
const fs = require("fs");
const { Buffer } = require('buffer');
const difficulty_regex = new RegExp('^000000');


class Block{
	/*
	HINT: buffer.subarray(x,x+y) means we are taking y bytes from the buffer starting at index x!
	*/
	constructor(buffer, id){
		this.raw_bytes = buffer;
		// byte arrays
		this.UTORID = buffer.subarray(0,8);
		this.prev_block_hash = buffer.subarray(8,40);
		this.nonce = buffer.subarray(40,44);
		// string representations
		this.UTORID_str = bytesToStr(this.UTORID);
		this.prev_block_hash_hex = bytesToHex(this.prev_block_hash);
		this.nonce_hex = bytesToHex(this.nonce);
		// Int id
		this.id = id;
	}
	toString(){
		return `Block ${this.id}:\n- UTORID: ${this.UTORID_str}\n- Prev block hash: ${this.prev_block_hash_hex}\n- Nonce: ${this.nonce_hex}`;
	}
	exportBytes(){
		return this.raw_bytes;
	}
	get_hash(){
		return crypto.createHash('sha256').update(new Uint8Array(this.raw_bytes)).digest('hex');
	}


}

class Blockchain{
	constructor(folder_name, trace_flag){
		this.folder_name = folder_name;
		this.list_of_blocks = [];
		this.trace_flag = trace_flag;
	}

	import_blocks(){
		// Imports all local block files into memory

		// Start with the hardcoded genesis block
		const genesis_block_bytes = this.transform_to_buffer("GENESIS","","deadbeef");
		const genesis_block = new Block(genesis_block_bytes, 0);
		this.list_of_blocks.push(genesis_block);

		// Import the rest, if they exist
		var i = 1;
		while(true){
			try{
				var block_data = fs.readFileSync(`./${this.folder_name}/block${i}.bin`, null);
				var block = new Block(block_data, i);
				var is_consistent = this.validate_block(block);
				if(!is_consistent){
					console.log(`ERROR! Block ${i} is not a valid block. How did this happen?`);
					break;
				}
				//console.log(`Imported block ${i}`);
				this.list_of_blocks.push(block);
				i++;
			}catch(e){
				//console.log(`No local block ${i}, finished importing`);
				break;
			}
		}
		console.log(`Read ${i-1} blocks from local files`);
	}

	wipe(){
		// deletes all local blocks in the blockchain (EXCEPT the genesis block);
		while(this.list_of_blocks.length > 1){
			this.list_of_blocks.pop();
		}

		var i = 1;
		while(true){
			try{
				// delete the local file
				fs.unlinkSync(`./${this.folder_name}/block${i}.bin`);
				i++;
			}catch(e){
				console.log("Wiped blockchain!");
				break;
			}
		}
	}

	add_block(block_data){
		var new_id = this.list_of_blocks.length;
		var block = new Block(block_data, new_id);
		var is_consistent = this.validate_block(block);
		this.trace(block.toString());
		this.trace("Hash: " + block.get_hash());
		this.trace(`Will we add this block? ${is_consistent}`);
		if(is_consistent){
			this.list_of_blocks.push(block);
			let fd = fs.openSync(`./${this.folder_name}/block${new_id}.bin`, 'w');
			let bw = fs.writeSync(fd, block_data, 0, block_data.length);
			fs.closeSync(fd);
			this.trace(`Successfully wrote block ${new_id} to folder ${this.folder_name}`);
		}
		return is_consistent;
	}

	get_block(index){
		if(index >= this.list_of_blocks.length)return null;
		else return this.list_of_blocks[index].exportBytes();
	}

	get_prev_block_hash(){
		return this.list_of_blocks[this.list_of_blocks.length - 1].get_hash();
	}

	validate_block(block){
		/*
		Check if the hash of the most recent block in this.list_of_blocks matches this block's prev hash,
		also check if the block has a valid proof of work
		*/
		let hash = block.get_hash();
		return difficulty_regex.test(hash)
			&& block.prev_block_hash_hex === this.get_prev_block_hash();
	}

	transform_to_buffer(UTORID, prev_hash_hex, nonce_hex){
		let buff_arr = [];
		let UTORID_bytes = strToBytes(UTORID);
		let prev_hash_bytes = hexToBytes(prev_hash_hex);
		let nonce_bytes = hexToBytes(nonce_hex);

		let temp1 = Buffer.concat([UTORID_bytes],8);
		let temp2 = Buffer.concat([temp1,prev_hash_bytes],40);
		return Buffer.concat([temp2,nonce_bytes],44);
	}

	block_solution_to_buffer(hex){
		return Buffer.concat([hexToBytes(hex)],44);
	}

	print_all(){
		for(let block of this.list_of_blocks){
			console.log(block.toString());
		}
	}

	print_last_n(n){
		let min = Math.max(0, this.list_of_blocks.length - n);
		for(let i = min; i < this.list_of_blocks.length; i++){
			console.log(this.list_of_blocks[i].toString());
		}
	}

	get_blockchain_length(){
		return this.list_of_blocks.length;
	}

	trace(msg){
		if(this.trace_flag)console.log(`[TRACE] ${msg}`);
	}

}

function strToBytes(str){
	return Buffer.from(str, 'utf8');
}

function bytesToStr(bytes){
	return String.fromCharCode.apply(null, bytes);
}

function hexToBytes(hex) {
    return Buffer.from(hex, 'hex');
}

function bytesToHex(bytes) {
    return bytes.toString('hex');
}

module.exports = { Blockchain };