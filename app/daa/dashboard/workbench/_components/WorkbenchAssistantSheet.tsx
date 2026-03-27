"use client";

import { useState } from "react";
import { Bot } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { WorkbenchAssistantPanel } from "@/app/daa/dashboard/workbench/_components/WorkbenchAssistantPanel";
import type { AssistantChatModel } from "@/app/daa/dashboard/_hooks/useAssistantChat";

export function WorkbenchAssistantSheet(props: {
  assistant: AssistantChatModel;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 浮动触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--bg)] shadow-[0_8px_24px_rgba(56,189,248,0.32)] transition-transform hover:scale-105 active:scale-95"
        title="打开交易助手"
      >
        <Bot className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[420px] max-w-[90vw] overflow-y-auto border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.99),rgba(8,12,20,1))] p-0 text-[var(--text)] sm:max-w-[420px]"
        >
          <SheetTitle className="sr-only">交易助手</SheetTitle>
          <div className="p-4">
            <WorkbenchAssistantPanel assistant={props.assistant} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
