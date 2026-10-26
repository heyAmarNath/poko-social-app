import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Shows a friendly message instead of a blank screen if a page crashes while rendering. */
/** Give it a `key` that changes per page, so navigating away clears the error. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon"><AlertTriangle /></EmptyMedia>
          <EmptyTitle>Something went wrong on this page</EmptyTitle>
          <EmptyDescription>{this.state.error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button onClick={() => location.reload()}>Reload</Button></EmptyContent>
      </Empty>
    );
  }
}
