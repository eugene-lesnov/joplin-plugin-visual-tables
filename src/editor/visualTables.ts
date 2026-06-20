const { Decoration, EditorView, WidgetType } = require('@codemirror/view');
const { StateField, RangeSetBuilder } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');
import strings from '../localization';

interface CodeMirrorWrapper {
	cm6?: boolean;
	editor?: any;
	addExtension: (extension: unknown) => void;
	registerCommand: (name: string, callback: (...args: any[]) => void) => void;
}

const INSERT_TABLE_COMMAND = 'visualTables.insertTable';

const TABLE_TEMPLATE = [
	'| Header 1 | Header 2 |',
	'| --- | --- |',
	'|  |  |',
	'|  |  |',
].join('\n');

interface Cell {
	text: string;
	pos: number;
	col: number;
}

interface TableLine {
	from: number;
	to: number;
	isDelimiter: boolean;
	pipes: number[];
}

interface MenuItem {
	title: string;
	icon: string;
	enabled: boolean;
	danger?: boolean;
	onClick: () => void;
}

type MenuEntry = MenuItem | 'separator';

const ICONS = {
	rowAbove: '<svg viewBox="0 0 24 24"><rect x="3" y="13" width="18" height="7" rx="1"/><path d="M12 3v6M9 6h6"/></svg>',
	rowBelow: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="1"/><path d="M12 21v-6M9 18h6"/></svg>',
	colLeft: '<svg viewBox="0 0 24 24"><rect x="13" y="3" width="7" height="18" rx="1"/><path d="M3 12h6M6 9v6"/></svg>',
	colRight: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="7" height="18" rx="1"/><path d="M21 12h-6M18 9v6"/></svg>',
	clear: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
	deleteRow: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="6" rx="1"/><path d="M9 12h6"/></svg>',
	deleteCol: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="18" rx="1"/><path d="M12 9v6"/></svg>',
};

interface ParsedTable {
	from: number;
	to: number;
	header: Cell[];
	rows: Cell[][];
	columnCount: number;
	lines: TableLine[];
}

const NODE_TABLE = 'Table';
const NODE_TABLE_HEADER = 'TableHeader';
const NODE_TABLE_ROW = 'TableRow';

const tableTheme = EditorView.baseTheme({
	'.cm-table-widget': {
		display: 'inline-block',
		maxWidth: '100%',
		margin: '0.3em 0',
	},
	'.cm-table-grid': {
		display: 'grid',
		gridTemplateColumns: 'auto 1.4em',
		gridTemplateRows: 'auto 1.2em',
		gap: '2px',
	},
	'.cm-table-grid table': {
		borderCollapse: 'collapse',
		width: 'auto',
		gridColumn: '1',
		gridRow: '1',
	},
	'.cm-table-add-col': {
		gridColumn: '2',
		gridRow: '1',
	},
	'.cm-table-add-row': {
		gridColumn: '1',
		gridRow: '2',
	},
	'.cm-table-add-btn': {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		color: 'var(--joplin-color, currentColor)',
		background: 'var(--joplin-background-color-hover, rgba(128, 128, 128, 0.12))',
		border: '1px solid var(--joplin-divider-color, rgba(128, 128, 128, 0.6))',
		cursor: 'pointer',
		userSelect: 'none',
		fontSize: '1em',
		lineHeight: '1',
		opacity: '0',
		transition: 'opacity 0.12s ease',
	},
	'.cm-table-widget.cm-show-col .cm-table-add-col': {
		opacity: '0.6',
	},
	'.cm-table-widget.cm-show-row .cm-table-add-row': {
		opacity: '0.6',
	},
	'.cm-table-add-btn:hover': {
		opacity: '1',
	},
	'.cm-table-widget th, .cm-table-widget td': {
		border: '1px solid var(--joplin-divider-color, rgba(128, 128, 128, 0.6))',
		padding: '0.25em 0.6em',
		minWidth: '2em',
		height: '1.4em',
		textAlign: 'left',
	},
	'.cm-table-widget th': {
		fontWeight: 'bold',
		background: 'var(--joplin-background-color-hover, rgba(128, 128, 128, 0.12))',
	},
	'.cm-table-widget .cm-cell-active': {
		background: 'var(--joplin-selected-color, rgba(128, 128, 128, 0.12))',
	},
});

function isEscaped(text: string, index: number): boolean {
	let backslashes = 0;
	for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
	return backslashes % 2 === 1;
}

function unescapedPipes(text: string): number[] {
	const pipes: number[] = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '|' && !isEscaped(text, i)) pipes.push(i);
	}
	return pipes;
}

function parseCells(lineStart: number, rowText: string): Cell[] {
	const pipes = unescapedPipes(rowText);

	if (pipes.length < 2) {
		const leadingWs = rowText.length - rowText.trimStart().length;
		return [{ text: rowText.trim(), pos: lineStart + leadingWs, col: 0 }];
	}

	const cells: Cell[] = [];
	for (let k = 0; k < pipes.length - 1; k++) {
		const segStart = pipes[k] + 1;
		const segment = rowText.slice(segStart, pipes[k + 1]);
		const leadingWs = segment.length - segment.trimStart().length;
		cells.push({ text: segment.trim(), pos: lineStart + segStart + leadingWs, col: k });
	}
	return cells;
}

function parseRow(state: any, rowNode: any): Cell[] {
	const line = state.doc.lineAt(rowNode.from);
	return parseCells(line.from, line.text);
}

function isDelimiterLine(text: string): boolean {
	const trimmed = text.trim();
	return trimmed.includes('-') && /^[|\s:-]+$/.test(trimmed);
}

function parseTable(state: any, tableNode: any): ParsedTable | null {
	let header: Cell[] = [];
	const rows: Cell[][] = [];

	for (let child = tableNode.firstChild; child; child = child.nextSibling) {
		if (child.name === NODE_TABLE_HEADER) header = parseRow(state, child);
		else if (child.name === NODE_TABLE_ROW) rows.push(parseRow(state, child));
	}

	if (!header.length && !rows.length) return null;

	const columnCount = rows.reduce((max, row) => Math.max(max, row.length), header.length);
	const pad = (cells: Cell[]): Cell[] => {
		if (cells.length >= columnCount) return cells;
		const fallbackPos = cells.length ? cells[cells.length - 1].pos : tableNode.from;
		const padded = cells.slice();
		while (padded.length < columnCount) padded.push({ text: '', pos: fallbackPos, col: padded.length });
		return padded;
	};

	const startLine = state.doc.lineAt(tableNode.from);
	const endLine = state.doc.lineAt(tableNode.to);

	const lines: TableLine[] = [];
	for (let n = startLine.number; n <= endLine.number; n++) {
		const line = state.doc.line(n);
		const pipes = unescapedPipes(line.text).map(offset => line.from + offset);
		lines.push({ from: line.from, to: line.to, isDelimiter: isDelimiterLine(line.text), pipes });
	}

	return {
		from: startLine.from,
		to: endLine.to,
		header: header.length ? pad(header) : header,
		rows: rows.map(pad),
		columnCount,
		lines,
	};
}

function collectTables(state: any): ParsedTable[] {
	const tables: ParsedTable[] = [];
	syntaxTree(state).iterate({
		enter: (nodeRef: any) => {
			if (nodeRef.name !== NODE_TABLE) return;
			const parsed = parseTable(state, nodeRef.node);
			if (parsed) tables.push(parsed);
			return false;
		},
	});
	return tables;
}

function selectionTouches(selection: any, from: number, to: number): boolean {
	for (const range of selection.ranges) {
		if (range.from <= to && range.to >= from) return true;
	}
	return false;
}

function highlightCell(cellEl: HTMLElement): () => void {
	cellEl.classList.add('cm-cell-active');
	return () => cellEl.classList.remove('cm-cell-active');
}

function buildRow(
	view: any,
	cellTag: 'th' | 'td',
	cells: Cell[],
	table: ParsedTable,
	lineIndex: number,
	isDataRow: boolean,
): HTMLTableRowElement {
	const tr = document.createElement('tr');
	for (const cell of cells) {
		const el = document.createElement(cellTag);
		el.textContent = cell.text.length ? cell.text : '\u00A0';
		el.addEventListener('mousedown', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.button !== 0) return;
			view.dispatch({ selection: { anchor: cell.pos } });
			view.focus();
		});
		el.addEventListener('contextmenu', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const clearHighlight = highlightCell(el);
			showMenu(event.clientX, event.clientY, [
				{ title: strings.insertRowAboveLabel, icon: ICONS.rowAbove, enabled: isDataRow, onClick: () => insertRow(view, table, lineIndex, 'above') },
				{ title: strings.insertRowBelowLabel, icon: ICONS.rowBelow, enabled: isDataRow, onClick: () => insertRow(view, table, lineIndex, 'below') },
				'separator',
				{ title: strings.insertColumnLeftLabel, icon: ICONS.colLeft, enabled: true, onClick: () => insertColumn(view, table, cell.col, 'left') },
				{ title: strings.insertColumnRightLabel, icon: ICONS.colRight, enabled: true, onClick: () => insertColumn(view, table, cell.col, 'right') },
				'separator',
				{ title: strings.clearCellLabel, icon: ICONS.clear, enabled: cell.text.length > 0, onClick: () => clearCell(view, table, lineIndex, cell.col) },
				'separator',
				{ title: strings.deleteRowLabel, icon: ICONS.deleteRow, enabled: isDataRow, danger: true, onClick: () => deleteRow(view, table, lineIndex) },
				{ title: strings.deleteColumnLabel, icon: ICONS.deleteCol, enabled: table.columnCount > 1, danger: true, onClick: () => deleteColumn(view, table, cell.col) },
			], clearHighlight);
		});
		tr.appendChild(el);
	}
	return tr;
}

function emptyRowText(columnCount: number): string {
	return '|' + '  |'.repeat(columnCount);
}

function addRow(view: any, table: ParsedTable): void {
	view.dispatch({ changes: { from: table.to, insert: `\n${emptyRowText(table.columnCount)}` } });
}

function cellPlaceholder(isDelimiter: boolean): string {
	return isDelimiter ? ' --- ' : '  ';
}

function addColumn(view: any, table: ParsedTable): void {
	const changes = table.lines.map(line => ({
		from: line.to,
		insert: `${cellPlaceholder(line.isDelimiter)}|`,
	}));
	view.dispatch({ changes });
}

function insertRow(view: any, table: ParsedTable, lineIndex: number, side: 'above' | 'below'): void {
	const rowText = emptyRowText(table.columnCount);
	const line = table.lines[lineIndex];
	if (side === 'above') {
		view.dispatch({ changes: { from: line.from, insert: `${rowText}\n` } });
	} else {
		view.dispatch({ changes: { from: line.to, insert: `\n${rowText}` } });
	}
}

function insertColumn(view: any, table: ParsedTable, col: number, side: 'left' | 'right'): void {
	const pipeIndex = side === 'left' ? col : col + 1;
	const changes = [];
	for (const line of table.lines) {
		if (line.pipes.length > pipeIndex) {
			changes.push({ from: line.pipes[pipeIndex] + 1, insert: `${cellPlaceholder(line.isDelimiter)}|` });
		}
	}
	view.dispatch({ changes });
}

function deleteRow(view: any, table: ParsedTable, lineIndex: number): void {
	const line = table.lines[lineIndex];
	view.dispatch({ changes: { from: line.from - 1, to: line.to, insert: '' } });
}

function deleteColumn(view: any, table: ParsedTable, col: number): void {
	const changes = [];
	for (const line of table.lines) {
		if (line.pipes.length > col + 1) {
			changes.push({ from: line.pipes[col], to: line.pipes[col + 1], insert: '' });
		}
	}
	view.dispatch({ changes });
}

function clearCell(view: any, table: ParsedTable, lineIndex: number, col: number): void {
	const line = table.lines[lineIndex];
	if (line.pipes.length <= col + 1) return;
	view.dispatch({ changes: { from: line.pipes[col] + 1, to: line.pipes[col + 1], insert: '  ' } });
}

const MENU_STYLE_ID = 'cm-table-menu-style';

function ensureMenuStyles(): void {
	if (document.getElementById(MENU_STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = MENU_STYLE_ID;
	style.textContent = [
		'.cm-table-menu {',
		'  position: fixed;',
		'  z-index: 1000;',
		'  display: flex;',
		'  align-items: center;',
		'  gap: 2px;',
		'  padding: 4px 6px;',
		'  background: var(--joplin-background-color, #fff);',
		'  color: var(--joplin-color, #000);',
		'  border: 1px solid var(--joplin-divider-color, rgba(128, 128, 128, 0.6));',
		'  border-radius: 6px;',
		'  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);',
		'}',
		'.cm-table-menu-item {',
		'  display: flex;',
		'  align-items: center;',
		'  justify-content: center;',
		'  width: 28px;',
		'  height: 28px;',
		'  border-radius: 4px;',
		'  cursor: pointer;',
		'  color: var(--joplin-color, #000);',
		'}',
		'.cm-table-menu-item svg {',
		'  width: 18px;',
		'  height: 18px;',
		'  fill: none;',
		'  stroke: currentColor;',
		'  stroke-width: 1.8;',
		'  stroke-linecap: round;',
		'  stroke-linejoin: round;',
		'}',
		'.cm-table-menu-item:hover {',
		'  background: var(--joplin-background-color-hover, rgba(128, 128, 128, 0.18));',
		'}',
		'.cm-table-menu-item.cm-danger:hover {',
		'  color: var(--joplin-color-error, #e05a5a);',
		'}',
		'.cm-table-menu-item.cm-disabled {',
		'  opacity: 0.35;',
		'  cursor: default;',
		'}',
		'.cm-table-menu-sep {',
		'  width: 1px;',
		'  align-self: stretch;',
		'  margin: 2px 3px;',
		'  background: var(--joplin-divider-color, rgba(128, 128, 128, 0.5));',
		'}',
	].join('\n');
	document.head.appendChild(style);
}

let activeMenu: HTMLElement | null = null;
let menuCloseListener: ((event: Event) => void) | null = null;
let menuOnClose: (() => void) | null = null;

function closeMenu(): void {
	if (activeMenu) {
		activeMenu.remove();
		activeMenu = null;
	}
	if (menuCloseListener) {
		document.removeEventListener('mousedown', menuCloseListener, true);
		document.removeEventListener('scroll', menuCloseListener, true);
		window.removeEventListener('blur', menuCloseListener);
		menuCloseListener = null;
	}
	if (menuOnClose) {
		const onClose = menuOnClose;
		menuOnClose = null;
		onClose();
	}
}

function showMenu(x: number, y: number, entries: MenuEntry[], onClose?: () => void): void {
	closeMenu();
	ensureMenuStyles();
	menuOnClose = onClose || null;

	const menu = document.createElement('div');
	menu.className = 'cm-table-menu';
	menu.style.visibility = 'hidden';

	for (const entry of entries) {
		if (entry === 'separator') {
			const sep = document.createElement('div');
			sep.className = 'cm-table-menu-sep';
			menu.appendChild(sep);
			continue;
		}
		const el = document.createElement('div');
		el.className = 'cm-table-menu-item';
		if (!entry.enabled) el.classList.add('cm-disabled');
		if (entry.danger) el.classList.add('cm-danger');
		el.innerHTML = entry.icon;
		el.title = entry.title;
		if (entry.enabled) {
			el.addEventListener('mousedown', (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				closeMenu();
				entry.onClick();
			});
		}
		menu.appendChild(el);
	}

	document.body.appendChild(menu);
	activeMenu = menu;

	const rect = menu.getBoundingClientRect();
	const left = Math.min(x, window.innerWidth - rect.width - 8);
	const top = Math.min(y, window.innerHeight - rect.height - 8);
	menu.style.left = `${Math.max(8, left)}px`;
	menu.style.top = `${Math.max(8, top)}px`;
	menu.style.visibility = 'visible';

	menuCloseListener = (event: Event) => {
		if (event instanceof MouseEvent && menu.contains(event.target as Node)) return;
		closeMenu();
	};
	setTimeout(() => {
		if (!menuCloseListener) return;
		document.addEventListener('mousedown', menuCloseListener, true);
		document.addEventListener('scroll', menuCloseListener, true);
		window.addEventListener('blur', menuCloseListener);
	}, 0);
}

function createAddButton(modifier: string, title: string, onClick: () => void): HTMLElement {
	const button = document.createElement('div');
	button.className = `cm-table-add-btn ${modifier}`;
	button.textContent = '+';
	button.title = title;
	button.addEventListener('mousedown', (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		onClick();
	});
	return button;
}

class TableWidget extends WidgetType {
	private readonly table: ParsedTable;
	private readonly signature: string;

	constructor(table: ParsedTable) {
		super();
		this.table = table;
		this.signature = JSON.stringify([table.header, table.rows]);
	}

	eq(other: TableWidget): boolean {
		return other.signature === this.signature;
	}

	toDOM(view: any): HTMLElement {
		const wrapper = document.createElement('div');
		wrapper.className = 'cm-table-widget';

		const grid = document.createElement('div');
		grid.className = 'cm-table-grid';

		const table = document.createElement('table');

		if (this.table.header.length) {
			const thead = document.createElement('thead');
			thead.appendChild(buildRow(view, 'th', this.table.header, this.table, 0, false));
			table.appendChild(thead);
		}

		const tbody = document.createElement('tbody');
		this.table.rows.forEach((row, i) => {
			tbody.appendChild(buildRow(view, 'td', row, this.table, i + 2, true));
		});
		table.appendChild(tbody);

		grid.appendChild(table);
		grid.appendChild(createAddButton('cm-table-add-col', strings.addColumnLabel, () => addColumn(view, this.table)));
		grid.appendChild(createAddButton('cm-table-add-row', strings.addRowLabel, () => addRow(view, this.table)));
		wrapper.appendChild(grid);

		const EDGE = 36;
		wrapper.addEventListener('mousemove', (event: MouseEvent) => {
			const rect = wrapper.getBoundingClientRect();
			wrapper.classList.toggle('cm-show-col', rect.right - event.clientX <= EDGE);
			wrapper.classList.toggle('cm-show-row', rect.bottom - event.clientY <= EDGE);
		});
		wrapper.addEventListener('mouseleave', () => {
			wrapper.classList.remove('cm-show-col', 'cm-show-row');
		});

		wrapper.addEventListener('mousedown', (event: MouseEvent) => {
			event.preventDefault();
			if (event.button !== 0) return;
			view.dispatch({ selection: { anchor: this.table.from } });
			view.focus();
		});
		wrapper.addEventListener('contextmenu', (event: MouseEvent) => {
			event.preventDefault();
		});

		return wrapper;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

function buildDecorations(state: any): any {
	const builder = new RangeSetBuilder();
	for (const table of collectTables(state)) {
		if (selectionTouches(state.selection, table.from, table.to)) continue;
		builder.add(
			table.from,
			table.to,
			Decoration.replace({
				widget: new TableWidget(table),
				block: true,
			}),
		);
	}
	return builder.finish();
}

function insertTable(view: any): void {
	const { state } = view;
	const pos = state.selection.main.head;
	const line = state.doc.lineAt(pos);

	const prefix = line.text.length ? '\n' : '';
	const insert = `${prefix}${TABLE_TEMPLATE}\n`;
	const at = line.to;

	view.dispatch({
		changes: { from: at, insert },
		selection: { anchor: at + prefix.length },
	});
	view.focus();
}

const tableField = StateField.define({
	create: (state: any) => buildDecorations(state),
	update: (decorations: any, transaction: any) => {
		if (transaction.docChanged || transaction.selection) {
			return buildDecorations(transaction.state);
		}
		return decorations.map(transaction.changes);
	},
	provide: (field: any) => EditorView.decorations.from(field),
});

export default () => ({
	plugin: (codeMirrorWrapper: CodeMirrorWrapper) => {
		if (!codeMirrorWrapper.cm6) return;
		codeMirrorWrapper.addExtension([tableField, tableTheme]);
		codeMirrorWrapper.registerCommand(INSERT_TABLE_COMMAND, () => {
			insertTable(codeMirrorWrapper.editor);
		});
	},
});
