BIN = ../../node_modules/.bin

.PHONY: tests bundles test

tests:
	../../bin/borschik -t ../techs/css+image -i tests/layout/a.css -o tests/layout/_a.css
	../../bin/borschik -t ../techs/css+image -i tests/padding/a.css -o tests/padding/_a.css

bundles:
	rm -rf tests/bundles/_sprited
	../../bin/borschik -t ../techs/css+image -i tests/bundles/a/a.css -o tests/bundles/a/_a.css
		../../bin/borschik -t ../techs/css+image -i tests/bundles/a/a_add.css -o tests/bundles/a/_a_add.css
		../../bin/borschik -t ../techs/css+image -i tests/bundles/a/a_use.css -o tests/bundles/a/_a_use.css
	../../bin/borschik -t ../techs/css+image -i tests/bundles/b/b.css -o tests/bundles/b/_b.css
		../../bin/borschik -t ../techs/css+image -i tests/bundles/b/b_add.css -o tests/bundles/b/_b_add.css

test:
	$(BIN)/mocha
