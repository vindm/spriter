(function() {

    var Mapper = (function() {

        /**
         * @param {String} layout
         * @constructor
         */
        var Mapper = function(params) {
            this.layout = params.layout || Mapper.defaultLayout;

            this.width = params.width || 0;
            this.height = params.height || 0;

            this.images = params.mappedData && params.mappedData.images || [];
        };

        Mapper.restore = function(config) {
            var mapper =  new Mapper(config.mapper),
                fitter = new RowFitter(config.mappedData);

            mapper.images = config.images || fitter.images;

            function restoreBlock(parent, blockConfig) {
                var block;

                if (blockConfig.type === 'column') {
                    block = new Column(parent, fitter, blockConfig);
                } else {
                    block = new Row(parent, fitter, blockConfig);
                }

                if (block.isParent) {
                    block.items = block.items.map(function(item) {
                        return restoreBlock(block, item);
                    });
                }

                return block;
            }

            fitter.canvas = restoreBlock(fitter, fitter.canvas);

            mapper.fitter = fitter;

            return mapper;

        };

        Mapper.prototype.mapImages = function(images, params) {
            var mapper = this,
                dimensions = {},
                handler;

            try {
                if ( ! Array.isArray(images)) {
                    throw new TypeError('Images are not array');
                }

                images.forEach(function(image) {
                    image.totalWidth ||
                        (image.totalWidth = image.padding[3] + image.width + image.padding[1]);
                    image.totalHeight ||
                        (image.totalHeight = image.padding[0] + image.height + image.padding[2]);
                });

                handler = Mapper['_map_' + mapper.layout];
                if (typeof handler !== 'function') {
                    handler = Mapper['_map_' + Mapper.defaultLayout];
                }

                dimensions = handler.apply(mapper, arguments);

            } catch(e) {
                console.error('Mapper Error: ', e)
            }

            mapper.height = dimensions.height || 0;
            mapper.width = dimensions.width || 0;

            return dimensions;
        };

        Mapper.defaultLayout = 'smart';

        Mapper._map_vertical = function(images) {
            return images
                .sort(function(a, b) {
                    return a.width - b.width;
                })
                .reduce(function(dimensions, image) {
                    image.positionX = 0;
                    image.positionY = dimensions.height -
                        Math.min(dimensions.prevPaddingBottom, image.padding[0]);

                    dimensions.height += image.totalHeight;
                    dimensions.prevPaddingBottom = image.padding[2];

                    image.totalWidth > dimensions.width &&
                    (dimensions.width = image.totalWidth);

                    return dimensions;
                }, {
                    width : 0, height : 0,
                    prevPaddingBottom : 0
                });
        };

        Mapper._map_horizontal = function(images) {
            return images
                .sort(function(a, b) {
                    return a.height - b.height;
                })
                .reduce(function(dimensions, image) {
                    image.positionY = 0;
                    image.positionX = dimensions.width -
                        Math.min(dimensions.prevPaddingRight, image.padding[3]);

                    dimensions.width += image.totalWidth;
                    dimensions.prevPaddingRight = image.padding[1];

                    image.height > dimensions.height &&
                    (dimensions.height = image.totalHeight);

                    return dimensions;
                }, {
                    width : 0, height : 0,
                    prevPaddingRight : 0
                });
        };

        Mapper._map_diagonal = function(images) {
            return images
                .sort(function(a, b) {
                    return a.width * a.height - b.width * b.height;
                })
                .reduce(function(dimensions, image) {
                    image.positionX = dimensions.width -
                        Math.min(dimensions.prevPaddingRight, image.padding[3]);
                    image.positionY = dimensions.height -
                        Math.min(dimensions.prevPaddingBottom, image.padding[0]);

                    dimensions.width += image.totalWidth;
                    dimensions.height += image.totalHeight;
                    dimensions.prevPaddingRight = image.padding[1];
                    dimensions.prevPaddingBottom = image.padding[2];

                    return dimensions;
                }, {
                    width : 0, height : 0,
                    prevPaddingRight : 0,
                    prevPaddingBottom : 0
                });
        };

        Mapper._map_smart = function(images, params) {
            var fitter = new RowFitter(params, images);

            fitter.fit();

            return fitter;
        };


        /**
         * @param {Array} images
         * @constructor
         */
        var RowFitter = Mapper.Fitter = function(params, images) {
            this.canvas = params && params.canvas || new Column(this, this);

            if (params) {
                this.min_width = params.min_width;
                this.max_width = params.max_width;
                this.max_height = params.max_height;
            }
            this.deep_level = params && params.deep_level || 5;
            this.allowed_diff = params && params.allowed_diff || 100;

            this.images = images ?
                images.sort(function(a, b) {
                var ath = a.totalHeight,
                    atw = a.totalWidth,
                    bth = b.totalHeight,
                    btw = b.totalWidth,
                    ah = atw * ath + ath * ath,
                    aw = atw * ath + atw * atw,
                    bh = btw * bth + bth * bth,
                    bw = btw * bth + btw * btw;

                return ah === bh ?
                    bw - aw :
                    bh - ah;
            }) :
                [];
        };

        RowFitter.getFitnessBlock = function(startBlock, image) {
            function find(block) {
                var found;

                if (block.isParent) {
                    found = block.items.some(find);
                }

                if ( ! found && found !== 0 && block._willFitItem(image)) {
                    block.add(image);
                    found = true;
                }

                return found;
            }

            return find(startBlock);
        };

        Object.defineProperties(
            RowFitter.prototype, {
                height : {
                    get : function() {
                        return this.canvas.totalHeight;
                    },
                    enumerable : true
                },
                width : {
                    get : function() {
                        return this.canvas.totalWidth;
                    },
                    enumerable : true
                },
                good_width  : {
                    get : function() {
                        if ( ! this.last_good_width) {
                            var good_width = this.images
                                .reduce(function(sum, img) {
                                    return sum + img.totalWidth * img.totalHeight;
                                }, 0);

                            this.last_good_width = Math.round(Math.sqrt(good_width * 1.5));
                        }

                        return this.last_good_width;

                    },
                    enumerable : true
                },
                good_height : {
                    get : function() {
                        return this.good_width;
                    },
                    enumerable : true
                }
            }
        );

        RowFitter.prototype.checkEfficiency = function(elem, image) {
            elem.add(image);

            var coef = (this.height * this.height + this.width * this.width);

            elem.items.pop();

            return coef;

        };

        RowFitter.prototype.getBestLayout = function() {
            var good = this.min_width / this.max_width,
                std = 0.01,
                curSquare,
                bestSquare,
                bestLayout;

            //            for (good = 0; good <= 1; good += 0.1) {
            //                GOOF_WIDTH_DIFF = good;
            //
            //                for (std = 0; std < this.allowed_diff; std += 5) {
            //                    STD_DIFF = std;
            //
            //                    this.canvas.items = [];
            //                    curSquare = this.fast_fit();
            //
            //                    if ( ! bestSquare || bestSquare > curSquare) {
            //                        bestSquare = curSquare;
            //                        bestLayout = this.canvas.items;
            //                    }
            //                }
            //            }

            this.fast_fit();
            return this.canvas.items;
        };

        RowFitter.prototype.fit = function() {
            this.canvas.items = this.getBestLayout();
            return {
                images : this.map(),
                width : this.canvas.width,
                height : this.canvas.height
            }
        };

        RowFitter.prototype.fast_fit = function() {
            var canvas = this.canvas,
                images = this.images;

            images.forEach(function(image, i) {
                var elem = canvas.willFit(image);

                if(elem) {
                    elem.add(image);
                }
            });
        };

        RowFitter.prototype.scan_fit = function() {
            var canvas = this.canvas,
                blocks,
                blocksCount,
                acceptor,
                acceptorInd,
                donor,
                donorInd,
                donorImages,
                donorImagesCount,
                image,
                imageInd,
                fittestBlock,
                isChanged,
                changedImages = [];

            this.fast_fit();

            do {
                blocks = canvas.items;
                blocksCount = blocks.length;
                isChanged = false;

                for (acceptorInd = 0; acceptorInd < blocksCount; acceptorInd += 1) {
                    acceptor = blocks[acceptorInd];

                    for (donorInd = acceptorInd + 1; donorInd < blocksCount; donorInd += 1) {
                        donor = blocks[donorInd];
                        donorImages = donor.images;
                        donorImagesCount = donorImages.length;

                        for (imageInd = donorImagesCount - 1; imageInd >= 0; imageInd -= 1) {
                            image = donorImages[imageInd];

                            if (changedImages.indexOf(image.id) !== -1) {
                                continue;
                            }

                            fittestBlock = acceptor.willFit(image);
                            if (fittestBlock) {
                                var parent = image.parent;

                                image.parent.items = parent.items;

                                donorImagesCount -= 1;

                                fittestBlock.add(image);
                                changedImages.push(image.id);
                                isChanged = true;
                            }
                        }
                    }
                }

            } while(isChanged);
        };

        RowFitter.prototype.map = function() {
            var images = [];

            function mapColumn(column, pos) {
                column.items
                    .reduce(function(rowPos, row) {
                        var rowPadding = row.padding;

                        rowPos.y -= (rowPos.prevPaddingBottom < rowPadding[0] ?
                            rowPos.prevPaddingBottom :
                            rowPadding[0]);

                        row.isParent ?
                            mapRow(row, { x : rowPos.x, y : rowPos.y }) :
                            mapRowImages(row, rowPos);

                        rowPos.y += row.totalHeight;
                        rowPos.prevPaddingBottom = rowPadding[2];

                        return rowPos;
                    }, {
                        x : pos.x,
                        y : pos.y,
                        prevPaddingBottom : 0
                    });
            }

            function mapColumnImages(column, columnPos) {
                column.items
                    .reduce(function(imagePos, image) {
                        var imagePadding = image.padding;

                        image.positionX = columnPos.x;
                        image.positionY = imagePos.y - (imagePos.prevPaddingBottom < imagePadding[0] ?
                            imagePos.prevPaddingBottom :
                            imagePadding[0]);

                        images.push(image);

                        imagePos.y = image.positionY + image.totalHeight;
                        imagePos.prevPaddingBottom = imagePadding[2];

                        return imagePos;
                    }, {
                        x : columnPos.x,
                        y : columnPos.y,
                        prevPaddingBottom : 0
                    });
            }

            function mapRow(row, pos) {
                row.items
                    .reduce(function(columnPos, column) {
                        var columnPadding = column.padding;

                        columnPos.x -= (columnPos.prevPaddingRight < columnPadding[3] ?
                            columnPos.prevPaddingRight :
                            columnPadding[3]);

                        column.isParent ?
                            mapColumn(column, { x : columnPos.x, y : columnPos.y }) :
                            mapColumnImages(column, columnPos);

                        columnPos.x += column.totalWidth;
                        columnPos.prevPaddingRight = columnPadding[1];

                        return columnPos;
                    }, {
                        x : pos.x,
                        y : pos.y,
                        prevPaddingRight : 0
                    });
            }

            function mapRowImages(row, rowPos) {
                row.items
                    .reduce(function(imagePos, image) {
                        var imagePadding = image.padding;

                        image.positionY = imagePos.y;
                        image.positionX = imagePos.x - (imagePos.prevPaddingRight < imagePadding[3] ?
                            imagePos.prevPaddingRight :
                            imagePadding[3]);

                        images.push(image);

                        imagePos.x = image.positionX + image.totalWidth;
                        imagePos.prevPaddingRight = imagePadding[1];

                        return imagePos;
                    }, {
                        x : rowPos.x,
                        y : rowPos.y,
                        prevPaddingRight : 0
                    });
            }

            this.canvas.isParent ?
                mapColumn(this.canvas, { x : 0, y : 0 }) :
                mapColumnImages(this.canvas, { x : 0, y : 0 });

            return images;
        };


        /**
         *
         * @param parent
         * @param fitter
         * @constructor
         */
        var Block = function(parent, fitter, params) {
            Object.defineProperties(this, {
                fitter : {
                    get : function() {
                        return fitter;
                    }
                },
                parent : {
                    get : function() {
                        return parent;
                    }
                }
            });

            if (params) {
                this.deep = params.deep;
                this.items = params.items;
            } else {
                this.deep = (parent.deep || 0) + 1;
                this.items = [];
            }

        };

        Object.defineProperties(
            Block.prototype, {
                isParent : {
                    get : function() {
                        return this.deep && this.deep < this.fitter.deep_level;
                    },
                    enumerable : true
                },
                childType : {
                    get : function() {
                        return this.type === 'column' ?
                            'row' :
                            'column';
                    },
                    enumerable: true
                },
                images : {
                    get : function() {
                        var _this = this;
                        var ret = ! this.isParent ?
                            this.items :
                            this.items
                                .reduce(function(images, item) {
                                    images = images.concat(item.images);
                                    return images;
                                }, []);

                        return ret;
                    },
                    enumerable: true
                },
                width : {
                    get : function() {
                        return this.items
                            .reduce(function(sum, item) {
                                var itemPadding = item.padding;

                                sum.total += item.totalWidth -
                                    (sum.prevPaddingRight < itemPadding[3] ? sum.prevPaddingRight : itemPadding[3]);

                                sum.prevPaddingRight = itemPadding[1];

                                return sum;
                            }, {
                                total : 0,
                                prevPaddingRight : 0
                            })
                            .total;
                    },
                    enumerable : true
                },
                height : {
                    get : function() {
                        return this.items
                            .reduce(function(sum, item) {
                                var itemPadding = item.padding;

                                sum.total += item.totalHeight -
                                    (sum.prevPaddingBottom < itemPadding[0] ? sum.prevPaddingBottom : itemPadding[0]);

                                sum.prevPaddingBottom = itemPadding[2];

                                return sum;
                            }, {
                                total : 0,
                                prevPaddingBottom : 0
                            })
                            .total;
                    },
                    enumerable : true
                },
                max_width : {
                    get : function() {
                        return this.parent.good_width || this.parent.max_width || 0;
                    },
                    enumerable : true
                },
                max_height : {
                    get : function() {
                        return this.parent.good_height || this.parent.max_height || 0;
                    },
                    enumerable : true
                },
                totalHeight : {
                    get : function() {
                        return this.height;
                    },
                    enumerable : true
                },
                totalWidth : {
                    get : function() {
                        return this.width;
                    },
                    enumerable : true
                },
                padding : {
                    get : function() {
                        var items = this.items,
                            padding = [
                                0, items[0].padding[1],
                                0, items[items.length - 1].padding[3]
                            ];

                        items.reduce(function(maxHeight, item) {
                            var itemHeight = item.totalHeight,
                                itemPadding;

                            if (itemHeight > maxHeight) {
                                itemPadding = item.padding;

                                padding[0] = itemPadding[0];
                                padding[2] = itemPadding[2];

                                maxHeight = itemHeight;
                            }

                            return maxHeight;
                        }, 0);

                        return padding;
                    },
                    enumerable : true
                }
            }
        );

        Block.prototype.add = function(image) {
            var block = this;

            if (block.isParent) {
                block.newBlock(image);
            } else {
                image.parent ?
                    image.parent = block :
                    Object.defineProperty(image, 'parent', { get : function() { return block } });

                block.items.push(image);
            }
        };

        Block.prototype.newBlock = function(image) {
            var block = new Block(this, this.fitter);

            image && block.add(image);
            this.items.push(block);

            return block;
        };

        Block.prototype.willFit = function(image) {
            var found,
                data;

            if (this.isParent) {
                data = this.willChildrenFitItem(image);
            }

            if ( ! (data && data.elem)) {
                if (this._willFitItem(image)) {
                    found = this;
                }
            } else  {
                found = data.elem;

                if (this._willFitItem(image)) {
                    var coef1 = data.efficiency,
                        coef2 = this.fitter.checkEfficiency(this, image);

                    (coef1 > coef2) && (found = this);
                }
            }

            return found;
        };

        Block.prototype.willChildrenFitItem = function(image) {
            var block = this,
                fitter = block.fitter;

            return block.items.reduce(function(bestFit, child) {
                var elem = child.willFit(image);

                if (elem) {
                    var efficiency = fitter.checkEfficiency(elem, image);

                    if ( ! bestFit.efficiency || bestFit.efficiency > efficiency) {
                        bestFit.efficiency = efficiency;
                        bestFit.elem = elem;
                    }
                }

                return bestFit;
            }, {
                efficiency : null,
                elem : false
            });

        };

        Block.prototype._willFitItem = function(image) {
            var hMax = this.max_height,
                wMax = this.max_width,
                hDiff = hMax - this.totalHeight - image.totalHeight,
                wDiff = wMax - this.totalWidth - image.totalWidth;

            return ( ! wMax || wDiff >= 0) &&
                ( ! hMax || hDiff >= 0);
        };


        /**
         * @constructor
         */
        var Column = function() {
            Block.apply(this, arguments);

            this.type = 'column';
        };

        Column.prototype = Object.create(Block.prototype);

        Object.defineProperties(
            Column.prototype, {
                width : {
                    get : function() {
                        return this.items
                            .reduce(function(lastMaxWidth, item) {
                                var itemWidth = item.totalWidth;

                                return itemWidth > lastMaxWidth ?
                                    itemWidth :
                                    lastMaxWidth;
                            }, 0);
                    },
                    enumerable : true
                },
                max_width : {
                    get : function() {
                        return this.parent.good_width || this.width;
                    },
                    enumerable : true
                },
                padding : {
                    get : function() {
                        var items = this.items,
                            padding = [
                                items[0] ? items[0].padding[0] : 0, 0,
                                items[0] ? items[items.length - 1].padding[2] : 0, 0
                            ];

                        items.reduce(function(maxWidth, item) {
                            var itemWidth = item.totalWidth,
                                itemPadding;

                            if (itemWidth > maxWidth) {
                                itemPadding = item.padding;

                                padding[1] = itemPadding[1];
                                padding[3] = itemPadding[3];

                                maxWidth = itemWidth;

                            }

                            return maxWidth;
                        }, 0);

                        return padding;
                    },
                    enumerable : true
                }
            }
        );

        Column.prototype.newBlock = function(image) {
            var row = new Row(this, this.fitter);

            image && row.add(image);
            this.items.push(row);

            return row;
        };

        Column.prototype._willFitItem = function(image) {
            var hDiff = this.max_height - this.totalHeight - image.totalHeight,
                hDiffPerc = Math.abs(hDiff) * 100 / this.max_height;

            return this.max_width > image.totalWidth && ! this.max_height || hDiff >= 0 || (hDiffPerc < this.fitter.allowed_diff);
        };


        /**
         * @constructor
         */
        var Row = function() {
            Block.apply(this, arguments);

            this.type = 'row';
        };

        Row.prototype = Object.create(Block.prototype);

        Object.defineProperties(
            Row.prototype, {
                height : {
                    get : function() {
                        return this.items
                            .reduce(function(lastMaxHeight, item) {
                                var itemHeight = item.totalHeight;

                                return itemHeight > lastMaxHeight ?
                                    itemHeight :
                                    lastMaxHeight;
                            }, 0);
                    },
                    enumerable: true
                },
                max_height : {
                    get : function() {
                        return this.parent.good_height || this.height;
                    },
                    enumerable : true
                },
                padding : {
                    get : function() {
                        var items = this.items,
                            padding = [
                                0, items[0] ? items[0].padding[1] : 0,
                                0, items[0] ? items[items.length - 1].padding[3] : 0
                            ];

                        items.reduce(function(maxHeight, item) {
                            var itemHeight = item.totalHeight,
                                itemPadding;

                            if (itemHeight > maxHeight) {
                                itemPadding = item.padding;

                                padding[0] = itemPadding[0];
                                padding[2] = itemPadding[2];

                                maxHeight = itemHeight;
                            }

                            return maxHeight;
                        }, 0);

                        return padding;
                    },
                    enumerable : true
                }
            }
        );

        Row.prototype.newBlock = function(image) {
            var column = new Column(this, this.fitter);

            image && column.add(image);
            this.items.push(column);

            return column;
        };

        Row.prototype._willFitItem = function(image) {
            var wDiff = this.max_width - this.totalWidth - image.totalWidth,
                wDiffPerc = Math.abs(wDiff) * 100 / this.max_width;

            return this.max_height > image.totalHeight && ! this.max_width || wDiff >= 0 || (wDiffPerc < this.fitter.allowed_diff) ;
        };


        return Mapper;
    })();

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = Mapper;
    } else {
        if (typeof define === 'function' && define.amd) {
            define([], function() {
                return Mapper;
            });
        } else {
            window.Mapper = Mapper;
        }
    }

})();
