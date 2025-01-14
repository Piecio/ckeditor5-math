import type { Math } from './index.js';

declare module '@ckeditor/ckeditor5-core' {
	interface PluginsMap {
		[ Math.pluginName ]: Math;
	}
}
