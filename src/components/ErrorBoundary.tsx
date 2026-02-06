import { Component, type ReactNode } from "react";
import { clientLogger } from "../lib/logging/clientLogger";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    clientLogger.error("ui.unhandled_error", { error });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="alert alert-error m-4">
          <span>Something went wrong. Please reload the editor.</span>
        </div>
      );
    }

    return this.props.children;
  }
}
