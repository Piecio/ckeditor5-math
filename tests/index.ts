import { describe, expect, it } from 'vitest';
import { Math as MathDll, icons } from '../src/index.js';
import Math from '../src/math.js';

import ckeditor from './../theme/icons/ckeditor.svg';

describe( 'CKEditor5 Math DLL', () => {
	it( 'exports Math', () => {
		expect( MathDll ).to.equal( Math );
	} );

	describe( 'icons', () => {
		it( 'exports the "ckeditor" icon', () => {
			expect( icons.ckeditor ).to.equal( ckeditor );
		} );
	} );
} );
