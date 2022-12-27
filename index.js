const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const GoalNearXZ = goals.GoalNearXZ;
const vec3 = require('vec3');
const utils = require('./utils');

// --- bot server and login information
const PORT_NUMBER = 12345; // CHANGEME the port number of minecraft server
const BOT_USERNAME = "Wheat_Farmer"; // CHANGEME the in game name of the bot
const settings = {
	host: "localhost",
	port: PORT_NUMBER,
	username: BOT_USERNAME,
};

// --- instance variables
const MAX_COMMAND_LENGTH = 5;
const TOOL_SLOT = 36; 
const CROP_PLANTING_RADIUS = 2;
const CROP_SEARCH_RADIUS = 32;
const TIMEOUT_LENGTH = 60000;
const EMPTY_SLOT_COUNT_FOR_DEPOSIT = 15;
const MIN_STACK_SIZE = 16;

// --- crop and plant states
var CROP; // the crop the bot harvests, specified by "harvest" command
var PLANT; // the plant the bot plants, specified by "harvest" command
var PLANT_GROWN_METADATA; // the metadata number that indicates the plant has fully grown

// --- bot states
var mcData;
var movements;
var modeHarvest;
var chestLocation;
var chestVec; 
var harvestTool;

// --- sets the states for crop and plants that the bot will harvest
function setCropAndPlant(cropName) {
	switch(cropName) {
		case "wheat":
			CROP = "wheat";
			PLANT = "wheat_seeds";
			PLANT_GROWN_METADATA = 7;
			break;
		case "carrot":
			CROP = "carrots";
			PLANT = "carrot";
			PLANT_GROWN_METADATA = 7;
			break;
		case "potato":
			CROP = "potatoes";
			PLANT = "potato";
			PLANT_GROWN_METADATA = 7;
			break;
		case "beetroot":
			CROP = "beetroots";
			PLANT = "beetroot_seeds";
			PLANT_GROWN_METADATA = 3;
			break;
		default:
			break;
	}
}

function disableHarvest() {
	modeHarvest = false;
	harvestTool = null;
	console.log("modeHarvest disabled");
}

function enableHarvest() {
	modeHarvest = true;
	console.log("modeHarvest enabled");
}

// --- Sets location of main chest
function setChestInfo(x, y, z) {
	chestLocation = utils.toMcCoordinates(x, y, z);
	chestVec = vec3(chestLocation.x, chestLocation.y, chestLocation.z);
	console.log(`Chest location set to ${chestLocation}`);
}

// --- Called when the "tool" command is used 
async function setHarvestTool () {
	if (modeHarvest) return;
	let botItems = bot.inventory.items(); 
	let tools = utils.getTools(botItems);
	// If bot has no tools (bad case)
	if (tools.length == 0) {
		bot.chat("I don't have any tools!");
		console.log(`${BOT_USERNAME} has 0 tools`);
	}
	// If bot has exactly one tool (good case)
	else if (tools.length == 1) {
		harvestTool = tools[0].name;
		await bot.moveSlotItem(tools[0].slot, TOOL_SLOT); 
		console.log(`${BOT_USERNAME} harvest tool set to ${harvestTool}`);
	}
	// If bot has more than one tool (bad case)
	else {
		bot.chat("Failed, I have too many tools so I will put them in the chest");
		console.log(`${BOT_USERNAME} has ${tools.length} tools`);
		depositTools();
	}
}

// --- Searches for a crop that is the closest to the bot's location
function searchNearbyCrop() {
	return bot.findBlock({
		matching: (block) => {
			return ((block.name == CROP) && (block.metadata == PLANT_GROWN_METADATA));
		},
		maxDistance: CROP_SEARCH_RADIUS
	});
}

// --- Makes the bot go close (within 1,2 blocks) to the coordinates
async function gotoNearXZ(coordinates) {
	try {
		let goal = new GoalNearXZ(coordinates.x, coordinates.z, CROP_PLANTING_RADIUS);
		await bot.pathfinder.goto(goal, true);
	} catch(e) {
		console.log(e);
	}
};

// --- Makes the bot go to the main chest
async function gotoChest() {
	await gotoNearXZ(chestLocation);
	let chestBlock = bot.findBlock({
		point: chestVec,
		matching: mcData.blocksByName['chest'].id,
	});
	if (!chestBlock) {
		bot.chat("Did you give me the right coordinates to the chest?");
		console.log("Chest not found");
	}
}

// --- Called when the bot's inventory is getting full and deposits items to the main chest
async function depositItems() {
	if (bot.inventory.emptySlotCount() <= EMPTY_SLOT_COUNT_FOR_DEPOSIT) {
		await gotoChest();
		try {
			let chestContainer = await bot.openContainer(bot.blockAt(chestVec));
			let seedKept = false;
			for (slot of bot.inventory.slots) {
				if (slot && slot.name != harvestTool) {
					if ((!seedKept) && (slot.name == PLANT) && (slot.count > MIN_STACK_SIZE)) {
						seedKept = true;
					}
					else {
						await chestContainer.deposit(slot.type, null, slot.count);
					}
				}
			}
			chestContainer.close();			
		} catch(e) {
			console.log(e);
		}
	}
}

// --- Called when the bot has too many tools when the "tool" command is called and deposits all 
// --- tools to the main chest
async function depositTools() {
	await gotoChest();
	try {
		let chestContainer = await bot.openContainer(bot.blockAt(chestVec));
		for (slot of bot.inventory.slots) { 
			if (slot && utils.isTool(slot.name)) {
				await chestContainer.deposit(slot.type, null, slot.count);
			}
		}
		chestContainer.close();			
	} catch(e) {
		console.log(e);
	}
}

// --- Harvests the crop closest to the bot
async function harvestCrop() {
	await depositItems();
	foundCrop = searchNearbyCrop()
	if (foundCrop) {
		try {
			// go to nearby crop
			let coordinates = 
				utils.toMcCoordinates(foundCrop.position.x, foundCrop.position.y, foundCrop.position.z);
			await gotoNearXZ(coordinates);
			// harvest the crop
			if (harvestTool) await bot.equip(mcData.itemsByName[harvestTool].id);
			await bot.dig(foundCrop);
			// plant new seed 
			if (!bot.heldItem || bot.heldItem.name != PLANT) {
				await bot.equip(mcData.itemsByName[PLANT].id);
			}
			let dirt = bot.blockAt(foundCrop.position.offset(0, -1, 0));
			await bot.placeBlock(dirt, vec3(0, 1, 0));
		} catch(e) {
			// The last line in the try block throws an error whenever the bot is on the block it
			// is trying to place (even slightly). The code will still work at intended. 
			// Therefore, ignore this error.
			if (e.message != "No block has been placed : the block is still air") {
				console.log(e);
			}
		}
		return true;
	}
	return false;
}

// --- The main function that handles when the bot should be harvesting and when to stop harvesting
async function beginHarvest(cropName) {
	if (modeHarvest) {
		bot.chat("I'm already harvesting!");
		console.log("harvest mode is already on");
	}
	if (!chestLocation) {
		bot.chat("You need to tell me a chest location");
		console.log("Chest location must be set");
		return;
	}
	setCropAndPlant(cropName);
	enableHarvest();
	while (modeHarvest) {
		// Contiunously harvest crops. If the bot can't find any more crops to harvest, wait 1 
		// minute to see if any crops have grown. 
		cropWasFound = await harvestCrop();
		if (!cropWasFound) {
			bot.chat("I can't find any more crops. I am taking a break");
			console.log("No more crops")
			await new Promise(resolve => setTimeout(resolve, TIMEOUT_LENGTH));
		}
	}
	disableHarvest();
}

// -- bot constructor (called immediately after bot is created)
const bot = mineflayer.createBot(settings);
bot.loadPlugin(pathfinder);
bot.once('spawn', () => {
	mcData = require('minecraft-data')(bot.version);
	movements = new Movements(bot, mcData);
	bot.pathfinder.setMovements(movements);
	movements.canDig = false;
	movements.blocksToAvoid.delete(mcData.blocksByName.wheat.id)
	movements.blocksToAvoid.add(mcData.blocksByName.sweet_berry_bush.id)
	disableHarvest();
	chestLocation = null;
});

// --- bot event listeners
bot.on("death", () => console.log(`${BOT_USERNAME} died!`));
bot.on("kicked", (reason, loggedIn) => console.log(reason, loggedIn));
bot.on("error", err => console.log(err));

// --- bot command listener
bot.on("chat", async (username, message) => {
	if (username == BOT_USERNAME) return;

	let tokens = message.split(' ');

	if ((tokens[0] == "harvest") && (tokens.length <= MAX_COMMAND_LENGTH)) {
		if ((tokens.length == 3) && (tokens[2] == "tool")) {
			setHarvestTool();
		} 
		switch(tokens[1]) {
			case "chest":
				setChestInfo(tokens[2], tokens[3], tokens[4]);
				break;
			case "wheat":
				beginHarvest("wheat");
				break;
			case "carrot":
				beginHarvest("carrot");
				break;
			case "potato":
				beginHarvest("potato");
				break;
			case "beetroot":
				beginHarvest("beetroot");
				break;
			case "stop":
				disableHarvest();
				break;
			default:
				bot.chat("Command does not exist");
				console.log("Invalid command");
		}		
	}
});