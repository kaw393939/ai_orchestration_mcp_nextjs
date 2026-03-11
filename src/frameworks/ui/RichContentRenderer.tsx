import React, { useState, useMemo } from "react";
import { UI_CONSTANTS } from "@/lib/constants";
import type {
  RichContent,
  BlockNode,
  InlineNode,
} from "../../core/entities/rich-content";
import dynamic from "next/dynamic";

const MermaidRenderer = dynamic(
  () =>
    import("../../components/MermaidRenderer").then(
      (mod) => mod.MermaidRenderer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[160px] w-full flex items-center justify-center text-xs opacity-50 animate-pulse bg-[var(--surface-muted)] rounded-xl border border-[var(--border-color)] my-2">
        Loading Diagram Engine...
      </div>
    ),
  },
);

const AudioPlayer = dynamic(
  () => import("../../components/AudioPlayer").then((mod) => mod.AudioPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="h-[72px] w-full max-w-sm flex items-center justify-center text-xs opacity-50 animate-pulse bg-[var(--surface-muted)] rounded-xl border border-[var(--border-color)] my-2">
        Loading Audio Engine...
      </div>
    ),
  },
);

interface Props {
  content: RichContent;
  onLinkClick?: (slug: string) => void;
}

export const RichContentRenderer: React.FC<Props> = ({
  content,
  onLinkClick,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {content.blocks.map((block, i) => {
        // Use stable keys for stateful blocks so React doesn't remount them
        // when preceding blocks shift indices during streaming.
        let key: string | number = i;
        if (block.type === "audio")
          key = `audio-${block.title}-${block.text.substring(0, 50)}`;
        else if (block.type === "code-block" && block.language === "mermaid")
          key = `mermaid-${block.code.substring(0, 50)}`;
        return <BlockRenderer key={key} block={block} onLinkClick={onLinkClick} />;
      })}
    </div>
  );
};

type BlockProps<T extends BlockNode> = { block: T; onLinkClick?: (slug: string) => void };

const blockRegistry: { [K in BlockNode["type"]]: React.FC<BlockProps<Extract<BlockNode, { type: K }>>> } = {
  paragraph: ({ block, onLinkClick }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">
      <InlineRenderer nodes={block.content} onLinkClick={onLinkClick} />
    </p>
  ),
  heading: ({ block, onLinkClick }) => {
    const Tag = `h${block.level + 1}` as "h1" | "h2" | "h3" | "h4";
    const sizeClass =
      block.level === 1
        ? "text-lg"
        : block.level === 2
          ? "text-base"
          : "text-sm";
    return (
      <Tag className={`${sizeClass} font-bold mt-4 mb-2`}>
        <InlineRenderer nodes={block.content} onLinkClick={onLinkClick} />
      </Tag>
    );
  },
  blockquote: ({ block, onLinkClick }) => (
    <blockquote className="my-3 pl-4 border-l-4 border-[var(--border-color)] opacity-75 italic text-sm leading-relaxed">
      <InlineRenderer nodes={block.content} onLinkClick={onLinkClick} />
    </blockquote>
  ),
  list: ({ block, onLinkClick }) => (
    <ul className="mb-4 ml-6 space-y-2 list-disc marker:text-[var(--accent-color)]">
      {block.items.map((item, i) => (
        <li key={i} className="leading-relaxed pl-1">
          <InlineRenderer nodes={item} onLinkClick={onLinkClick} />
        </li>
      ))}
    </ul>
  ),
  divider: () => <hr className="my-4 border-[var(--border-color)]" />,
  "code-block": ({ block }) => {
    if (block.language === "mermaid") {
      return <MermaidRenderer code={block.code} />;
    }
    return <CodeBlock code={block.code} lang={block.language} />;
  },
  table: ({ block, onLinkClick }) => (
    <TableRenderer
      header={block.header}
      rows={block.rows}
      onLinkClick={onLinkClick}
    />
  ),
  audio: ({ block }) => (
    <div className="my-2 max-w-sm">
      <AudioPlayer text={block.text} title={block.title} />
    </div>
  ),
};

const BlockRenderer: React.FC<{
  block: BlockNode;
  onLinkClick?: (slug: string) => void;
}> = ({ block, onLinkClick }) => {
  const RendererComponent = blockRegistry[block.type] as React.FC<BlockProps<BlockNode>>;
  if (!RendererComponent) return null;
  return <RendererComponent block={block} onLinkClick={onLinkClick} />;
};

type InlineProps<T extends InlineNode> = { node: T; onLinkClick?: (slug: string) => void };

const inlineRegistry: { [K in InlineNode["type"]]: React.FC<InlineProps<Extract<InlineNode, { type: K }>>> } = {
  text: ({ node }) => <>{node.text}</>,
  bold: ({ node }) => <strong>{node.text}</strong>,
  "code-inline": ({ node }) => (
    <code className="bg-[var(--surface-muted)] text-[var(--foreground)] px-1.5 py-0.5 rounded-md text-[0.85em] font-mono border border-[var(--border-color)]">
      {node.text}
    </code>
  ),
  "library-link": ({ node, onLinkClick }) => (
    <button
      onClick={() => onLinkClick?.(node.slug)}
      className="text-[var(--accent-color)] font-bold decoration-[var(--accent-color)]/30 underline decoration-2 underline-offset-4 hover:decoration-[var(--accent-color)] transition-all px-1 rounded hover:bg-[var(--accent-color)]/5"
    >
      {node.slug.replace(/-/g, " ")}
    </button>
  ),
};

const InlineRenderer: React.FC<{
  nodes: InlineNode[];
  onLinkClick?: (slug: string) => void;
}> = ({ nodes, onLinkClick }) => {
  return (
    <>
      {nodes.map((node, i) => {
        const RendererComponent = inlineRegistry[node.type] as React.FC<InlineProps<InlineNode>>;
        if (!RendererComponent) return null;
        return <RendererComponent key={i} node={node} onLinkClick={onLinkClick} />;
      })}
    </>
  );
};

const CodeBlock: React.FC<{ code: string; lang?: string }> = ({
  code,
  lang,
}) => {
  const [copied, setCopied] = React.useState(false);
  const copyCode = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), UI_CONSTANTS.COPY_TIMEOUT_MS);
  };
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-[var(--border-color)] text-sm">
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-mono">
          {lang || "code"}
        </span>
        <button
          onClick={copyCode}
          className="text-[10px] text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-[#0d1117] text-[#c9d1d9] px-5 py-4 overflow-x-auto font-mono text-sm leading-relaxed border-t border-[var(--border-color)]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const TableRenderer: React.FC<{
  header?: InlineNode[][];
  rows: InlineNode[][][];
  onLinkClick?: (slug: string) => void;
}> = ({ header, rows, onLinkClick }) => {
  return (
    <div className="my-4 w-full overflow-x-auto border border-[var(--border-color)] rounded-[var(--border-radius)]">
      <table className="w-full text-sm border-collapse">
        {header && (
          <thead>
            <tr className="bg-[var(--accent-color)] text-[var(--accent-foreground)]">
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="px-5 py-3 text-left font-bold text-xs uppercase tracking-wider"
                >
                  <InlineRenderer nodes={cell} onLinkClick={onLinkClick} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={
                ri % 2 === 0
                  ? "bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors"
                  : "bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] transition-colors"
              }
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-5 py-3.5 align-top leading-relaxed border-b border-[var(--border-color)]"
                >
                  <InlineRenderer nodes={cell} onLinkClick={onLinkClick} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
