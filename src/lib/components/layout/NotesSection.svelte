<script lang="ts">
	import { Mic, Paperclip, Bold, List } from '@lucide/svelte';

	const { 
		notes = '',
		onNotesChange = () => {}
	} = $props<{
		notes?: string;
		onNotesChange?: (notes: string) => void;
	}>();

	// Rich text formatting functions (placeholders)
	const formatBold = () => {
		// Placeholder for bold formatting
		console.log('Bold formatting');
	};

	const formatList = () => {
		// Placeholder for list formatting
		console.log('List formatting');
	};

	const startVoiceInput = () => {
		// Placeholder for voice-to-text
		console.log('Voice input');
	};

	const attachPhoto = () => {
		// Placeholder for photo attachment
		console.log('Photo attachment');
	};
</script>

<div class="glass p-4 border border-bg-surface/50">
	<div class="flex items-center justify-between mb-3">
		<h3 class="text-base font-semibold text-text-primary">Notes</h3>
		<div class="flex items-center gap-2">
			<!-- Rich Text Formatting Buttons -->
			<button
				onclick={formatBold}
				class="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-secondary/50 rounded"
				title="Bold"
			>
				<Bold class="w-4 h-4" />
			</button>
			<button
				onclick={formatList}
				class="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-secondary/50 rounded"
				title="List"
			>
				<List class="w-4 h-4" />
			</button>
			
			<!-- Voice Input Button -->
			<button
				onclick={startVoiceInput}
				class="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-secondary/50 rounded"
				title="Voice input"
			>
				<Mic class="w-4 h-4" />
			</button>
			
			<!-- Photo Attachment Button -->
			<button
				onclick={attachPhoto}
				class="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-secondary/50 rounded"
				title="Attach photo"
			>
				<Paperclip class="w-4 h-4" />
			</button>
		</div>
	</div>

	<textarea
		value={notes}
		oninput={(e) => onNotesChange(e.currentTarget.value)}
		placeholder="Add any additional notes..."
		class="w-full px-3 py-2 bg-bg-tertiary/50 border border-bg-surface/50 rounded-lg text-text-primary resize-none focus:border-info/50 focus:ring-info/20 transition-colors min-h-[100px]"
		rows="4"
	></textarea>

	<div class="flex justify-between items-center mt-2 text-xs text-text-tertiary">
		<span>Rich text formatting available</span>
		<span>{notes.length} characters</span>
	</div>
</div> 