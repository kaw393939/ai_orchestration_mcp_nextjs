import React from "react";
import type { PresentedMessage } from "../../adapters/ChatPresenter";
import { RichContentRenderer } from "./RichContentRenderer";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface MessageListProps {
  messages: PresentedMessage[];
  isSending: boolean;
  dynamicSuggestions: string[];
  onSuggestionClick: (text: string) => void;
  onLinkClick: (slug: string) => void;
  searchQuery: string;
}

const BrandHeader = () => (
  <div className="flex flex-col items-center justify-center pt-4 sm:pt-8 pb-2 sm:pb-3 px-3 sm:px-4 text-center space-y-2 sm:space-y-3 animate-in fade-in slide-in-from-top-4 duration-1000 ease-out fill-mode-both">
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold uppercase tracking-widest brand-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]" />
      System Operational
    </div>
    
    <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-tight text-[var(--foreground)] balance">
      Product Development <br />
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/60">
        in the AI Era.
      </span>
    </h1>
  </div>
);

export const MessageList: React.FC<MessageListProps> = React.memo(({
  messages,
  isSending,
  dynamicSuggestions,
  onSuggestionClick,
  onLinkClick,
  searchQuery,
}) => {
  const filteredMessages = searchQuery
    ? messages.filter((m) =>
        m.content.blocks.some((b) =>
          JSON.stringify(b).toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      )
    : messages;

  if (filteredMessages.length === 0 && searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
        <p className="text-sm font-medium">
          No messages found matching &ldquo;{searchQuery}&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 sm:gap-6 pb-8">
      {/* Show the grand brand header at the start of the conversation */}
      {messages.length <= 2 && !searchQuery && <BrandHeader />}

      {filteredMessages.map((message, index) => (
        <div key={message.id} className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out fill-mode-both">
          {message.role === "user" ? (
            <UserBubble content={message} />
          ) : (
            <AssistantBubble
              message={message}
              isStreaming={isSending && index === messages.length - 1}
              onLinkClick={onLinkClick}
              isInitialGreeting={index === 0}
            />
          )}

          {/* Render CTA Chips for the latest AI message */}
          {message.role === "assistant" &&
            !isSending &&
            index === messages.length - 1 &&
            dynamicSuggestions.length > 0 && (
              <div className="ms-12 mt-2 mb-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <SuggestionChips
                  suggestions={dynamicSuggestions}
                  onSend={onSuggestionClick}
                />
              </div>
            )}
        </div>
      ))}

      {isSending && messages[messages.length - 1]?.role === "user" && (
        <TypingIndicator />
      )}
    </div>
  );
});

MessageList.displayName = "MessageList";

const UserBubble = React.memo<{ content: PresentedMessage }>(({ content }) => {
  return (
    <div className="flex flex-col items-end gap-1.5 px-1 sm:px-2 md:px-0 w-full hover:-translate-y-0.5 transition-transform duration-300">
      <div className="max-w-[90%] md:max-w-[75%] bg-[var(--accent-color)] text-[var(--accent-foreground)] rounded-2xl rounded-tr-sm px-4 sm:px-5 py-2.5 sm:py-3 text-[13px] sm:text-sm leading-relaxed shadow-sm border border-black/5">
        <ErrorBoundary name="UserBubble">
          <RichContentRenderer content={content.content} />
        </ErrorBoundary>
      </div>
    </div>
  );
});

UserBubble.displayName = "UserBubble";

const AssistantBubble = React.memo<{
  message: PresentedMessage;
  isStreaming: boolean;
  onLinkClick: (slug: string) => void;
  isInitialGreeting?: boolean;
}>(({ message, isStreaming, onLinkClick, isInitialGreeting }) => {
  const [displayText, setDisplayText] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(!!isInitialGreeting);
  
  React.useEffect(() => {
    if (!isInitialGreeting) return;
    let current = "";
    let index = 0;
    const speed = 10;
    const fullText = message.rawContent || "";

    const interval = setInterval(() => {
      if (index < fullText.length) {
        current += fullText[index];
        setDisplayText(current);
        index++;
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [message.rawContent, isInitialGreeting]);

  return (
    <div className="flex justify-start gap-2.5 sm:gap-4 items-start px-1 sm:px-2 md:px-0 w-full transition-all duration-300 group">
      {/* Assistant Avatar */}
      <div className={`w-8 h-8 mt-1 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${isInitialGreeting ? "bg-[var(--accent-color)]/15 border-[var(--accent-color)]/30" : "bg-[var(--surface-muted)] border-[var(--border-color)]"}`}>
        <span className={`text-[10px] font-bold ${isInitialGreeting ? "text-[var(--accent-color)]" : "text-[var(--foreground)]/60"}`}>A</span>
      </div>

      {/* Borderless Content Area */}
      <div className={`flex flex-col gap-1.5 max-w-[95%] sm:max-w-[90%] w-full ${isInitialGreeting ? "pt-1" : ""}`}>
        <div className="text-[13px] sm:text-sm leading-relaxed text-[var(--foreground)] relative">
          <ErrorBoundary name="AssistantBubble">
            {isInitialGreeting ? (
              <div className="relative">
                {/* Ghost text for stable height */}
                <div className="invisible pointer-events-none" aria-hidden="true">
                  <RichContentRenderer content={message.content} />
                </div>
                {/* Visible content */}
                <div className="absolute inset-x-0 top-0">
                  {isTyping ? (
                    <div className="inline whitespace-pre-wrap">
                      {displayText}
                      <span className="inline-block w-1.5 h-4 ms-1 bg-[var(--accent-color)] animate-pulse align-middle" />
                    </div>
                  ) : (
                    <div className="animate-in fade-in duration-500">
                      <RichContentRenderer content={message.content} onLinkClick={onLinkClick} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <RichContentRenderer
                content={message.content}
                onLinkClick={onLinkClick}
              />
            )}
          </ErrorBoundary>

          {isStreaming && !isInitialGreeting && (
            <span className="inline-block w-1 h-3.5 bg-[var(--accent-color)] animate-pulse align-middle ms-1 rounded-sm relative -top-0.5" />
          )}
        </div>
      </div>
    </div>
  );
});

AssistantBubble.displayName = "AssistantBubble";

const TypingIndicator = () => (
  <div className="flex justify-start gap-2.5 items-center ms-12 mt-2">
    <div className="flex gap-1.5 items-center px-2 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] opacity-60 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] opacity-60 animate-bounce [animation-delay:120ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] opacity-60 animate-bounce [animation-delay:240ms]" />
    </div>
  </div>
);

const SuggestionChips: React.FC<{
  suggestions: string[];
  onSend: (text: string) => void;
}> = ({ suggestions, onSend }) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2.5">
      {suggestions.map((s, i) => (
        <button
          key={s}
          onClick={() => onSend(s)}
          style={{ animationDelay: `${i * 100}ms` }}
          className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--accent-color)] hover:text-[var(--accent-foreground)] hover:border-[var(--accent-color)] px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-medium text-[var(--foreground)] transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-sm hover:shadow-md animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
        >
          {s}
        </button>
      ))}
    </div>
  </div>
);
