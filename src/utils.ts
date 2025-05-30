import type { Editor, Element as CKElement, DocumentSelection, PositioningFunction } from 'ckeditor5';
import { CKEditorError, global, BalloonPanelView } from 'ckeditor5';

import type { KatexOptions, MathJax2, MathJax3 } from './typings/index.js';

export function getSelectedMathModelWidget(
	selection: DocumentSelection
): null | CKElement {
	const selectedElement = selection.getSelectedElement();

	if (
		selectedElement &&
		( selectedElement.is( 'element', 'mathtex-inline' ) ||
			selectedElement.is( 'element', 'mathtex-display' ) )
	) {
		return selectedElement;
	}

	return null;
}

// Simple MathJax 3 version check
export function isMathJaxVersion3( MathJax: unknown ): MathJax is MathJax3 {
	return (
		MathJax != null && typeof MathJax == 'object' && 'version' in MathJax && typeof MathJax.version == 'string' &&
		MathJax.version.split( '.' ).length === 3 &&
		MathJax.version.split( '.' )[ 0 ] === '3'
	);
}

// Simple MathJax 2 version check
export function isMathJaxVersion2( MathJax: unknown ): MathJax is MathJax2 {
	return (
		MathJax != null && typeof MathJax == 'object' && 'Hub' in MathJax );
}

// Check if equation has delimiters.
export function hasDelimiters( text: string ): RegExpMatchArray | null {
	return text.match( /^(\\\[.*?\\\]|\\\(.*?\\\))$/ );
}

// Find delimiters count
export function delimitersCounts( text: string ): number | undefined {
	return text.match( /(\\\[|\\\]|\\\(|\\\))/g )?.length;
}

// Extract delimiters and figure display mode for the model
export function extractDelimiters( equation: string ): {
	equation: string;
	display: boolean;
} {
	equation = equation.trim();

	// Remove delimiters (e.g. \( \) or \[ \])
	const hasInlineDelimiters =
		equation.includes( '\\(' ) && equation.includes( '\\)' );
	const hasDisplayDelimiters =
		equation.includes( '\\[' ) && equation.includes( '\\]' );
	if ( hasInlineDelimiters || hasDisplayDelimiters ) {
		equation = equation.substring( 2, equation.length - 2 ).trim();
	}

	return {
		equation,
		display: hasDisplayDelimiters
	};
}

export async function renderEquation(
	equation: string,
	element: HTMLElement,
	engine:
		| 'katex'
		| 'mathjax'
		| undefined
		| ( (
			equation: string,
			element: HTMLElement,
			display: boolean,
		) => void ) = 'katex',
	lazyLoad?: () => Promise<void>,
	display = false,
	preview = false,
	previewUid = '',
	previewClassName: Array<string> = [],
	katexRenderOptions: KatexOptions = {}
): Promise<void> {
	if ( engine == 'mathjax' ) {
		if ( isMathJaxVersion3( MathJax ) ) {
			selectRenderMode(
				element,
				preview,
				previewUid,
				previewClassName,
				el => {
					renderMathJax3( equation, el, display, () => {
						if ( preview ) {
							moveAndScaleElement( element, el );
							el.style.visibility = 'visible';
						}
					} );
				}
			);
		} else {
			selectRenderMode(
				element,
				preview,
				previewUid,
				previewClassName,
				el => {
					// Fixme: MathJax typesetting cause occasionally math processing error without asynchronous call
					global.window.setTimeout( () => {
						renderMathJax2( equation, el, display );

						// Move and scale after rendering
						if ( preview && isMathJaxVersion2( MathJax ) ) {
							// eslint-disable-next-line new-cap
							MathJax.Hub.Queue( () => {
								moveAndScaleElement( element, el );
								el.style.visibility = 'visible';
							} );
						}
					} );
				}
			);
		}
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	} else if ( engine === 'katex' ) {
		selectRenderMode(
			element,
			preview,
			previewUid,
			previewClassName,
			el => {
				if ( katex ) {
					const mathPreview = document.querySelector('.ck-math-preview');
					katex.render( equation, el, {
						throwOnError: false,
						displayMode: display,
						...katexRenderOptions
					} );
				}
				if ( preview ) {
					moveAndScaleElement( element, el );
					el.style.visibility = 'visible';
				}
			}
		);
	} else if ( typeof engine === 'function' ) {
		engine( equation, element, display );
	} else {
		if ( lazyLoad != null ) {
			try {
				global.window.CKEDITOR_MATH_LAZY_LOAD ??= lazyLoad();
				element.innerHTML = equation;
				await global.window.CKEDITOR_MATH_LAZY_LOAD;
				await renderEquation(
					equation,
					element,
					engine,
					undefined,
					display,
					preview,
					previewUid,
					previewClassName,
					katexRenderOptions
				);
			} catch ( err ) {
				element.innerHTML = equation;
				console.error(
					`math-tex-typesetting-lazy-load-failed: Lazy load failed: ${ String( err ) }`
				);
			}
		} else {
			element.innerHTML = equation;
			console.warn(
				`math-tex-typesetting-missing: Missing the mathematical typesetting engine (${ String( engine ) }) for tex.`
			);
		}
	}
}

export function getBalloonPositionData( editor: Editor ): {
	target: Range | HTMLElement;
	positions: Array<PositioningFunction>;
} {
	const view = editor.editing.view;
	const defaultPositions = BalloonPanelView.defaultPositions;

	const selectedElement = view.document.selection.getSelectedElement();
	if ( selectedElement ) {
		return {
			target: view.domConverter.viewToDom( selectedElement ),
			positions: [
				defaultPositions.southArrowNorth,
				defaultPositions.southArrowNorthWest,
				defaultPositions.southArrowNorthEast
			]
		};
	} else {
		const viewDocument = view.document;
		const firstRange = viewDocument.selection.getFirstRange();
		if ( !firstRange ) {
			/**
			* Missing first range.
			* @error math-missing-range
					*/
			throw new CKEditorError( 'math-missing-range' );
		}
		return {
			target: view.domConverter.viewRangeToDom(
				firstRange
			),
			positions: [
				defaultPositions.southArrowNorth,
				defaultPositions.southArrowNorthWest,
				defaultPositions.southArrowNorthEast
			]
		};
	}
}

function selectRenderMode(
	element: HTMLElement,
	preview: boolean,
	previewUid: string,
	previewClassName: Array<string>,
	cb: ( previewEl: HTMLElement ) => void
) {
	if ( preview ) {
		createPreviewElement(
			element,
			previewUid,
			previewClassName,
			previewEl => {
				cb( previewEl );
			}
		);
	} else {
		cb( element );
	}
}

function renderMathJax3( equation: string, element: HTMLElement, display: boolean, cb: () => void ) {
	let promiseFunction: undefined | ( ( input: string, options: { display: boolean } ) => Promise<HTMLElement> ) = undefined;
	if ( !isMathJaxVersion3( MathJax ) ) {
		return;
	}
	if ( MathJax.tex2chtmlPromise ) {
		promiseFunction = MathJax.tex2chtmlPromise;
	} else if ( MathJax.tex2svgPromise ) {
		promiseFunction = MathJax.tex2svgPromise;
	}

	if ( promiseFunction != null ) {
		void promiseFunction( equation, { display } ).then( ( node: Element ) => {
			if ( element.firstChild ) {
				element.removeChild( element.firstChild );
			}
			element.appendChild( node );
			cb();
		} );
	}
}

function renderMathJax2( equation: string, element: HTMLElement, display?: boolean ) {
	if ( isMathJaxVersion2( MathJax ) ) {
		if ( display ) {
			element.innerHTML = '\\[' + equation + '\\]';
		} else {
			element.innerHTML = '\\(' + equation + '\\)';
		}
		// eslint-disable-next-line
		MathJax.Hub.Queue(['Typeset', MathJax.Hub, element]);
	}
}

function createPreviewElement(
	element: HTMLElement,
	previewUid: string,
	previewClassName: Array<string>,
	render: ( previewEl: HTMLElement ) => void
): void {
	const previewEl = getPreviewElement( element, previewUid, previewClassName );
	render( previewEl );
}

function getPreviewElement(
	element: HTMLElement,
	previewUid: string,
	previewClassName: Array<string>
) {
	let previewEl = global.document.getElementById( previewUid );
	// Create if not found
	if ( !previewEl ) {
		previewEl = global.document.createElement( 'div' );
		previewEl.setAttribute( 'id', previewUid );
		previewEl.classList.add( ...previewClassName );
		previewEl.style.visibility = 'hidden';
		global.document.body.appendChild( previewEl );

		let ticking = false;

		const renderTransformation = () => {
			if ( !ticking ) {
				global.window.requestAnimationFrame( () => {
					if ( previewEl ) {
						moveElement( element, previewEl );
						ticking = false;
					}
				} );

				ticking = true;
			}
		};

		// Create scroll listener for following
		global.window.addEventListener( 'resize', renderTransformation );
		global.window.addEventListener( 'scroll', renderTransformation );
	}
	return previewEl;
}

function moveAndScaleElement(parent: HTMLElement, child: HTMLElement) {
    moveElement(parent, child);
    const domRect = child.getBoundingClientRect();
    parent.style.width = domRect.width + 'px';
    parent.style.height = domRect.height + 'px';
}

function moveElement(parent: HTMLElement, child: HTMLElement) {
    const domRect = parent.getBoundingClientRect();
    const left = global.window.scrollX + domRect.left;
    const top = global.window.scrollY + domRect.top;
    child.style.position = 'absolute';
	child.style.width = '100%';
	child.style.maxWidth = '500px';
    child.style.left = left + 'px';
    child.style.top = top + 'px';
    child.style.padding = '16px';
    child.style.zIndex = 'var(--ck-z-panel)';
    child.style.pointerEvents = 'none';
 
}