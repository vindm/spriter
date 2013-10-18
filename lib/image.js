var VOW = require('vow'),
    im = require('imagemagick');

/**
 * @constructor
 * @param {Object} imageData
 */
var Image = function(imageData) {
    this.ids = [ imageData.id ];
    this.path = imageData.url;

    this.positionX = imageData.position && imageData.position.x || 0;
    this.positionY = imageData.position && imageData.position.y || 0;
    this.padding = imageData.padding || [ 0, 0, 0, 0 ];
    this.width = imageData.width || 0;
    this.height = imageData.height || 0;
};

Image.EXT_NAMES_RE = /\.(png|gif|jpg|jpeg)$/;

Image.prototype.readDimensions = function() {
    var image = this,
        deferred = VOW.promise();

    im.identify(image.path, function(err, img) {
        if (err) {
            console.log(err);
            return deferred.reject(err);
        }

        image.width = img.width;
        image.height = img.height;


        image.totalWidth = image.padding[3] + image.width + image.padding[1];
        image.totalHeight = image.padding[0] + image.height + image.padding[2];

        deferred.fulfill(image);
    });

    return deferred;
};

module.exports = Image;
