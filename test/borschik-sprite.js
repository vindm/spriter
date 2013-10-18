var ASSERT = require("assert");
var should = require('should');


describe('borschik-sprite', function() {

    var PATH = require('path');
    var FS = require('fs');
    var Q = require('q');
    var BORSCHIK = require('../../.');

    var resourceDir = PATH.resolve(__dirname, 'borschik-sprite');

    const spriteDir = PATH.resolve(resourceDir, '_sprited');
    const fakeFileA = PATH.resolve(resourceDir, 'a/a.css');
    const fakeResFileA = PATH.resolve(resourceDir, 'a/_a.css');
    const fakeFileB = PATH.resolve(resourceDir, 'b/b.css');
    const fakeResFileB = PATH.resolve(resourceDir, 'b/_b.css');
    const fakeFileC = PATH.resolve(resourceDir, 'c/c.css');
    const fakeResFileC = PATH.resolve(resourceDir, 'c/_c.css');
    const fakeResConfigFile = PATH.resolve(spriteDir, 'common_a.json');
    const fakeResConfigFileC = PATH.resolve(spriteDir, 'common_a__c.json');

//    afterEach(function(cb) {
//        require('child_process').exec('rm -rf ' + [fakeResFileA, fakeResFileB].join(' '), function() {
//            cb();
//        });
//    });

    describe('sprite extending', function() {
        var images_a,
            images_b,
            images_c;

        function process_a(cb) {
            require('child_process').exec(
                '../../bin/borschik -t css+image -i ' + fakeFileA + ' -o ' + fakeResFileA + '',
                function() {
                    var result = JSON.parse(FS.readFileSync(fakeResConfigFile));
                    result = result && result.images;

                    if ( ! result) {
                        throw 'Bad result for ' + fakeResFileA;
                    }

                    cb(result);
                }
            );
        }

        function process_b(cb) {
            require('child_process').exec(
                '../../bin/borschik -t css+image -i ' + fakeFileB + ' -o ' + fakeResFileB + '',
                function() {
                    var result = JSON.parse(FS.readFileSync(fakeResConfigFile));
                    result = result && result.images;

                    if ( ! result) {
                        throw 'Bad result for ' + fakeResFileB;
                    }

                    cb(result);
                }
            );
        }

        function process_c(cb) {
            require('child_process').exec(
                '../../bin/borschik -t css+image -i ' + fakeFileC + ' -o ' + fakeResFileC + '',
                function() {
                    var result = JSON.parse(FS.readFileSync(fakeResConfigFile));
                    result = result && result.images;

                    if ( ! result) {
                        throw 'Bad result for ' + fakeResFileB;
                    }

                    var result2 = JSON.parse(FS.readFileSync(fakeResConfigFileC));
                    result2 = result2 && result2.images;

                    if ( ! result2) {
                        throw 'Bad result for ' + fakeResFileC;
                    }

                    cb([result, result2]);
                }
            );
        }

        it('should process bundle A and generate sprite common_a.png', function(done) {
            try {
                process_a(function(imagesA) {

                    imagesA.should.be.an.instanceOf(Array);
                    imagesA.length.should.not.be.below(1);

                    images_a = imagesA;

                    done();

                });
            } catch(e) {
                done(e.toString());
            }
        });

        it('should process bundle B and extend sprite common_a.png', function(done) {
            try {
                process_b(function(imagesB) {

                    imagesB.should.be.an.instanceOf(Array);
                    imagesB.should.not.have.length(0);
                    imagesB.length.should.not.be.below(images_a.length);

                    images_b = imagesB;

                    done();

                });
            } catch(e) {
                done(e.toString());
            }
        });

        it('images from bundle A shouldn\'t change positions', function(done) {
            var isChanged = images_a.some(function(image, i) {
                var newImage;

                images_b.some(function(img) {
                    if (img.path === image.path) {
                        newImage = img;
                        return true;
                    }
                });

                return ! (
                    newImage &&
                        ((image.positionX === newImage.positionX) &&
                            (image.positionY === newImage.positionY))
                    );
            });

            isChanged.should.not.be.ok;

            done();
        });


        it('should process bundle C and create sprite for images not found in common_a.png', function(done) {
            try {
                process_c(function(data) {
                    var imagesC = data[0],
                        imagesC2 = data[1];

                    imagesC.should.be.an.instanceOf(Array);
                    imagesC.should.have.length(images_b.length);

                    images_c = imagesC;

                    done();

                });
            } catch(e) {
                done(e.toString());
            }
        });

    });
});
