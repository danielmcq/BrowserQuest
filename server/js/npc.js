const Entity = require("./entity");

module.exports = class NPC extends Entity {
    constructor(id, kind, x, y) {
        super(id, "npc", kind, x, y);
    }
};