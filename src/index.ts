import joplin from 'api';
import { ContentScriptType, ToolbarButtonLocation } from 'api/types';
import strings from './localization';

const CONTENT_SCRIPT_ID = 'visualTables';
const INSERT_TABLE_COMMAND = 'visualTables.insertTable';

joplin.plugins.register({
	onStart: async function() {
		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			CONTENT_SCRIPT_ID,
			'./editor/visualTables.js',
		);

		await joplin.commands.register({
			name: INSERT_TABLE_COMMAND,
			label: strings.insertTableLabel,
			iconName: 'fas fa-table',
			enabledCondition: 'markdownEditorPaneVisible',
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: INSERT_TABLE_COMMAND,
				});
			},
		});

		await joplin.views.toolbarButtons.create(
			INSERT_TABLE_COMMAND,
			INSERT_TABLE_COMMAND,
			ToolbarButtonLocation.EditorToolbar,
		);
	},
});
