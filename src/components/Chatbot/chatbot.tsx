"use client";

import BotMessage from "./ui/bot-message";
import UserMessage from "./ui/user-message";
import { useState, useEffect, useRef } from "react";
import { signIn, useSession } from "next-auth/react";
import { useChat } from "ai/react";
import { ChevronDown } from "@geist-ui/icons";
import { toast } from "../ui/use-toast";
import { cn } from "@/lib/utils";
import { useSidebar } from "../ui/sidebar";
import { InputComputer } from "./ui/input-computer";
import { InputMobile } from "./ui/input-mobile";
import { useModel } from "@/hooks/use-model";

type Message = {
  role: "user" | "system" | "assistant";
  content: string;
  id: string;
};

function ScrollButton({ onClick }: { onClick: () => void }) {
  const { isMobile } = useSidebar();
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed left-[350px] top-1/2 z-10 -translate-x-1/2 -translate-y-1/2",
        "rounded-full bg-accent/80 p-2 text-accent-foreground shadow-md",
        "transition-all duration-200 hover:bg-accent",
        "animate-in fade-in-0 zoom-in-90",
        "opacity-50 hover:scale-105 hover:opacity-100 active:scale-95",
        isMobile && "left-[20px]",
      )}
      title="Scroll to bottom"
    >
      <ChevronDown className="h-5 w-5" />
    </button>
  );
}

export function ScrollableChatMessages({
  chatId,
  initialMessages,
  className,
  messagesClassName,
  slotBefore,
  slotAfter,
}: {
  chatId: string;
  initialMessages: Message[];
  className?: string;
  messagesClassName?: string;
  slotBefore?: React.ReactNode;
  slotAfter?: React.ReactNode;
}) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const model = useModel();

  const { messages } = useChat({
    id: chatId,
    api: "/api/chat",
    headers: {
      model: model,
    },
    experimental_throttle: 50,
    initialMessages: initialMessages,
  });

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const threshold = 200;
    const bottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      threshold;
    setIsAtBottom(bottom);
  };

  const scrollToBottom = () => {
    scrollableRef.current?.scrollTo({
      top: scrollableRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    console.log("isAtBottom", isAtBottom);

    if (isAtBottom) {
      scrollToBottom();
    }
  }, [isAtBottom, messages]);

  return (
    <div
      ref={scrollableRef}
      className={cn("flex h-full w-full flex-col overflow-y-auto", className)}
      onScroll={handleScroll}
    >
      {slotBefore}
      {!isAtBottom && <ScrollButton onClick={scrollToBottom} />}
      <ChatMessages
        chatId={chatId}
        initialMessages={initialMessages}
        className={messagesClassName}
      />
      {slotAfter}
    </div>
  );
}

function ChatMessages({
  chatId,
  initialMessages,
  className,
}: {
  chatId: string;
  initialMessages: Message[];
  className?: string;
}) {
  const model = useModel();
  const { isMobile } = useSidebar();
  const { messages } = useChat({
    id: chatId,
    api: "/api/chat",
    headers: {
      model: model,
    },
    experimental_throttle: 50,
    initialMessages: initialMessages,
  });

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 px-4",
        !isMobile && "mx-auto max-w-4xl",
        className,
      )}
    >
      {messages.length > 0 &&
        messages.map((m, index) => (
          <div
            key={index}
            className="duration-700 ease-out animate-in fade-in-0"
          >
            {m.role === "user" ? (
              <div className="rounded-lg">
                <UserMessage {...m} />
              </div>
            ) : (
              <div className="rounded-lg">
                <BotMessage {...m} createdAt={m.createdAt} />
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

const ChatInput = ({
  chatId,
  initialMessages,
  className,
}: {
  chatId: string;
  initialMessages: Message[];
  className?: string;
}) => {
  const { data: session } = useSession();
  const model = useModel();
  const { isMobile } = useSidebar();
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
  } = useChat({
    id: chatId,
    api: "/api/chat",
    headers: {
      model
    },
    body: {
      id: chatId,
    },
    initialMessages: initialMessages,
    experimental_throttle: 50,
    onError: (error) => {
      const errorMessage = error.message || "An error occurred";
      toast({
        variant: "destructive",
        title: errorMessage,
      });
    },
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLoading) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (session?.user) {
        handleSubmit(event as any);
      } else {
        signIn();
      }
    }
  };

  const handlePreInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isLoading) {
      handleInputChange(e);
    }
  };

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 bg-card pb-6 transition-all duration-300 ease-out md:pb-8",
        !isMobile && "p-4",
        className,
      )}
    >
      <form
        onSubmit={handleSubmit}
        className={cn(
          "relative flex items-center gap-2",
          isMobile ? "mx-2" : "mx-auto max-w-5xl",
        )}
      >
        {isMobile ? (
          <InputMobile
            input={input}
            isLoading={isLoading}
            handleKeyDown={handleKeyDown}
            handleInputChange={handlePreInputChange}
            stop={stop}
            reload={reload}
            disabled={messages.length === 0}
          />
        ) : (
          <InputComputer
            input={input}
            isLoading={isLoading}
            handleKeyDown={handleKeyDown}
            handleInputChange={handlePreInputChange}
            stop={stop}
            reload={reload}
            disabled={messages.length === 0}
          />
        )}
      </form>
    </div>
  );
};

export { ChatMessages, ChatInput };
