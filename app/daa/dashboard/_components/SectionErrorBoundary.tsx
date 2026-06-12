"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

type SectionErrorBoundaryProps = {
  /** 可选模块名称，出错时展示 */
  sectionName?: string;
  children: ReactNode;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * 模块级错误边界：捕获子树异常后渲染友好提示卡片，
 * 不影响页面其余部分正常工作。
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[SectionErrorBoundary${this.props.sectionName ? `:${this.props.sectionName}` : ""}]`,
      error,
      info,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-[var(--muted)]" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-[var(--muted)]">
                此模块加载失败{this.props.sectionName ? `（${this.props.sectionName}）` : ""}
              </p>
              {this.state.error?.message ? (
                <p className="text-xs text-[var(--faint)]">{this.state.error.message}</p>
              ) : null}
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--elevated)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                <RotateCcw className="h-3 w-3" />
                重试
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
