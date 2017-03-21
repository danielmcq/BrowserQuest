const _     = require("underscore");
const Item  = require("./item");
const Utils = require("./utils");
const Types = require("../../shared/js/gametypes");

module.exports = class Chest extends Item {
    constructor(id, x, y) {
        super(id, Types.Entities.CHEST, x, y);
    }

    setItems(items) {
        this.items = items;
    }

    getRandomItem() {
        var nbItems = _.size(this.items),
            item = null;

        if(nbItems > 0) {
            item = this.items[Utils.random(nbItems)];
        }
        return item;
    }
};