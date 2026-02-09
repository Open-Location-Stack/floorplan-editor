import { Component, type ReactNode } from "react";
import { clientLogger } from "../lib/logging/clientLogger";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage?: string;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

    return { hasError: true, errorMessage: message };
  }

  override componentDidCatch(error: unknown): void {
    clientLogger.error("ui.unhandled_error", { error });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="alert alert-error m-4 flex-col items-start gap-2">
          <span>Something went wrong. Please reload the editor.</span>
          {import.meta.env.DEV && this.state.errorMessage ? (
            <code className="rounded bg-base-300 px-2 py-1 text-xs">{this.state.errorMessage}</code>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}
