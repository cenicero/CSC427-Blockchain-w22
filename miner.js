const crypto = require("crypto");
const readline = require("readline");
const fs = require("fs");
const uint8max = 255;
const uint8maxPower4 = Math.pow(256,4);
const target = 6;
let readlineInterface = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});
let miner = null;

readlineInterface.question("UTORID? (exactly 8 chars, if less than 8 chars then prefix it with underscores so it is exactly 8 chars) ",(UTORID) => {
	if(/^[a-z0-9_]{8}$/.test(UTORID) === false){
		console.log(`Invalid UTORID: '${UTORID}'`);
		readlineInterface.close();
		return;
	}
	readlineInterface.question("prev. block hash? (hexadecimal 64 chars) ",(hash) => {
		if(/^[0-9a-f]{64}$/.test(hash) === false){
			console.log(`Invalid hash`);
			readlineInterface.close();
			return;
		}
		readlineInterface.close();
		start_mining(UTORID, hash);
	});
});


function start_mining(UTORID, hash){
	console.log("[MINER] Let's start mining!");
	let buffer = transform_to_buffer(UTORID, hash, '');
	let startTime = Date.now();
	miner = new Miner(buffer, (solution) => {
		if(solution === null){
			console.log("[MINER] No solution found (wow, what are the odds?)");
			process.exit();
		}else{
			let totalTime = ((Date.now() - startTime)/1000).toFixed(2);
			console.log(`[MINER] Finished mining a block! Writing the solution file (Duration: ${totalTime}s).`);
			console.log(`Verification: ${bytesToHex(solution)} results in hash:\n${miner.get_hash(solution)}`);
			fs.writeFile(__dirname + "/mined_block.txt", bytesToHex(solution), 'utf8', function(error) {
			    if(error) {
			        return console.log(error);
			    }
			    console.log("The file was saved!");
			    process.exit();
			}); 
		}
	});
	miner.start_mining();
}

function transform_to_buffer(UTORID, prev_hash_hex, nonce_hex){
	let buff_arr = [];
	let UTORID_bytes = strToBytes(UTORID);
	let prev_hash_bytes = hexToBytes(prev_hash_hex);
	let nonce_bytes = hexToBytes(nonce_hex);
	let temp1 = Buffer.concat([UTORID_bytes],8);
	let temp2 = Buffer.concat([temp1,prev_hash_bytes],40);
	return Buffer.concat([temp2,nonce_bytes],44);
}

function strToBytes(str){
	return Buffer.from(str, 'utf8');
}

function hexToBytes(hex) {
    return Buffer.from(hex, 'hex');
}

function bytesToHex(bytes) {
    return bytes.toString('hex');
}


class Miner{
	constructor(buffer, cb){
		this.buffer = buffer; //the block we are solving for
		this.cb = cb; //callback function when a sltn is found
		this.sltn_found = false;

		// helper metrics for outputting results
		this.attempts = 0;
		this.statistics = {};
		for(let i = 0; i <= target; i++){
			this.statistics[i] = 0;
		}

		// function binding
		this.mine = this.mine.bind(this);
		this.output_progress = this.output_progress.bind(this);
		this.get_hash = this.get_hash.bind(this);
		this.starts_with_zeroes = this.starts_with_zeroes.bind(this);
	}

	async start_mining(){
		while(await this.mine());

		if(this.sltn_found)this.cb(this.buffer);
		else this.cb(null);
	}

	async mine(){
		this.attempts++;

		//Check if our buffer makes up a valid block
		let hash = this.get_hash();
		let amt_of_zeroes = Math.min(this.starts_with_zeroes(hash),target);
		this.statistics[amt_of_zeroes]++;
		if(amt_of_zeroes >= target){
			this.output_progress();
			this.sltn_found = true;
			return false;
		}

		//If no solution is found, change the buffer and retry
		//Add one to the nonce buffer if possible
		let did_an_add = false;
		for(let i = 40; i < 44; i++){
			if(this.buffer[i] === uint8max){
				this.buffer[i] = 0;
			}else{
				this.buffer[i]++;
				did_an_add = true;
				if(i === 43){
					this.output_progress();
				}
				break;
			}
		}

		// If the last four bytes were uint8max, then we iterated all possible values without a solution
		if(!did_an_add){
			return false;
		}

		return true;
	}

	output_progress(){
		let prepare_stats = [];
		for(let i = 0; i <= target; i++){
			prepare_stats.push(`Saw ${i} zeroes ${this.statistics[i]} times`);
		}
		console.log(`[MINER] Checked ${this.attempts}/${uint8maxPower4} possible nonces for our block`);
		console.log(`[MINER] Hash statistics (for fun): \n${prepare_stats.join('\n')}`);
	}

	get_hash(){
		return crypto.createHash('sha256').update(new Uint8Array(this.buffer)).digest('hex');
	}

	starts_with_zeroes(hash){
		// Returns the amount of zeroes the hash begins with
		let amt = 0;
		for(let i = 0; i < hash.length; i++){
			if(hash[i] !== '0')break;
			amt++;
		}
		return amt;

	}
}
