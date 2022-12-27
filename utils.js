// --- Given name of item returns whether or not the item is a tool
function isTool(itemName) {
    itemName = itemName.toString();
	return ((itemName.endsWith("shovel")) || (itemName.endsWith("pickaxe")) || 
		(itemName.endsWith("axe")) || (itemName.endsWith("hoe")));
}

// --- Given list of items returns a list of tools within original list
function getTools(botItems) {
    const res = []
    for (let i = 0; i < botItems.length; ++i) {
        if (isTool(botItems[i].name)) {
            res.push(botItems[i]);
        }
    }
    return res
}

// --- Converts coordinates to minecraft coordinates
function toMcCoordinates(x, y, z) {
    const res = {}
    res.x = parseFloat(Math.floor(x)) - 0.5;
    res.y = parseFloat(Math.floor(y));
    res.z = parseFloat(Math.floor(z)) - 0.5;
    return res;
}

module.exports = {
    isTool: isTool,
    getTools: getTools,
    toMcCoordinates: toMcCoordinates,
};
