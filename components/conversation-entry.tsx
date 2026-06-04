import type { ConversationEntry, ContentBlock } from '@/lib/types';

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderContentBlock(block: ContentBlock, idx: number): React.ReactNode {
  if (block.type === 'text') {
    return (
      <pre key={idx} className="whitespace-pre-wrap text-green-300 text-xs leading-relaxed">
        {block.text}
      </pre>
    );
  }

  if (block.type === 'thinking') {
    return (
      <details key={idx} className="mt-2">
        <summary className="text-purple-500 text-xs cursor-pointer hover:text-purple-300">
          &lt;thinking&gt; {block.thinking.slice(0, 60)}…
        </summary>
        <pre className="mt-2 text-purple-400 text-xs whitespace-pre-wrap pl-4 border-l border-purple-800">
          {block.thinking}
        </pre>
      </details>
    );
  }

  if (block.type === 'tool_use') {
    const inputStr = JSON.stringify(block.input, null, 2);
    return (
      <details key={idx} className="mt-2 border border-cyan-900 rounded">
        <summary className="px-3 py-1.5 bg-cyan-950 text-cyan-400 text-xs cursor-pointer hover:bg-cyan-900 rounded-t">
          ▶ TOOL: {block.name} <span className="text-cyan-700 ml-2">({block.id.slice(0, 12)})</span>
        </summary>
        <pre className="p-3 text-cyan-300 text-xs whitespace-pre-wrap overflow-auto max-h-64 bg-black/30">
          {inputStr}
        </pre>
      </details>
    );
  }

  if (block.type === 'tool_result') {
    const content = typeof block.content === 'string'
      ? block.content
      : JSON.stringify(block.content, null, 2);
    return (
      <details key={idx} className="mt-2 border border-green-900 rounded">
        <summary className={`px-3 py-1.5 text-xs cursor-pointer rounded-t ${
          block.is_error ? 'bg-red-950 text-red-400 hover:bg-red-900' : 'bg-green-950 text-green-400 hover:bg-green-900'
        }`}>
          ◀ RESULT{block.is_error ? ' [ERROR]' : ''}: {block.tool_use_id.slice(0, 12)}
        </summary>
        <pre className="p-3 text-green-300 text-xs whitespace-pre-wrap overflow-auto max-h-64 bg-black/30">
          {content}
        </pre>
      </details>
    );
  }

  if (block.type === 'image') {
    return (
      <div key={idx} className="mt-2 text-xs text-green-600">
        [image: {block.source.media_type}]
      </div>
    );
  }

  return null;
}

interface ConversationEntryProps {
  entry: ConversationEntry;
}

export function ConversationEntryView({ entry }: ConversationEntryProps) {
  const isUser = entry.type === 'user';
  const msg = entry.message;

  return (
    <div className={`mb-4 ${isUser ? 'border-l-2 border-green-700' : 'border-l-2 border-cyan-800'} pl-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-bold ${isUser ? 'text-green-500' : 'text-cyan-500'}`}>
          {isUser ? '▶ USER' : '◀ ASSISTANT'}
        </span>
        <span className="text-xs text-green-800">{formatTimestamp(entry.timestamp)}</span>
        {!isUser && (entry.message as { model?: string }).model && (
          <span className="text-xs text-purple-700">
            {(entry.message as { model?: string }).model?.replace('claude-', '').replace(/-\d{8}$/, '')}
          </span>
        )}
        {!isUser && (entry.message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage && (
          <span className="text-xs text-green-800">
            {(entry.message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage?.input_tokens ?? 0}in /&nbsp;
            {(entry.message as { usage?: { input_tokens?: number; output_tokens?: number } }).usage?.output_tokens ?? 0}out
          </span>
        )}
      </div>

      <div className="text-xs">
        {isUser ? (
          typeof msg.content === 'string' ? (
            <pre className="whitespace-pre-wrap text-green-300">{msg.content}</pre>
          ) : Array.isArray(msg.content) ? (
            (msg.content as ContentBlock[]).map((b, i) => renderContentBlock(b, i))
          ) : null
        ) : (
          Array.isArray((msg as { content?: ContentBlock[] }).content)
            ? ((msg as { content?: ContentBlock[] }).content ?? []).map((b, i) => renderContentBlock(b, i))
            : null
        )}
      </div>
    </div>
  );
}
