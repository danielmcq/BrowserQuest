"use strict";

const Utils = require("./utils");

module.exports = class Checkpoint {
    constructor(id, x, y, width, height) {
        Object.assign(this, {id, x, y, width, height});
    }

    getRandomPosition() {
        const self = this;

        return {
            x: self.x + Utils.randomInt(0, self.width - 1),
            y: self.y + Utils.randomInt(0, self.height - 1)
        };
    }
};