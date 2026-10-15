"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="text-xs text-ink-secondary transition-colors hover:text-ink"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

/**
 * Markdown renderer with GFM tables/checklists and syntax-highlighted code
 * blocks (highlight.js classes are themed in globals.css for light + dark).
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          img:()=> <span>[Image omitted — open its source link if needed]</span>,
          pre: ({ children }) => (
            <div className="group/code relative my-3">
              <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/code:opacity-100">
                <CopyButton
                  label="Copy code"
                  getText={() =>
                    extractPreText(
                      (children as React.ReactElement<{ children?: React.ReactNode[] }>) ?? null,
                    )
                  }
                />
              </div>
              <pre>{children}</pre>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

/** Pulls the raw text out of a <pre> React node for the copy button. */
function extractPreText(node: React.ReactElement<{ children?: React.ReactNode[] }> | null): string {
  if (!node) return "";
  let out = "";
  const walk = (child: React.ReactNode): void => {
    if (typeof child === "string" || typeof child === "number") {
      out += String(child);
    } else if (Array.isArray(child)) {
      child.forEach(walk);
    } else if (child && typeof child === "object" && "props" in child) {
      const el = child as React.ReactElement<{ children?: React.ReactNode }>;
      walk(el.props.children);
    }
  };
  walk(node.props.children);
  return out;
}