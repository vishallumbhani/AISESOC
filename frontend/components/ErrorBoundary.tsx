import React, { Component, ErrorInfo, ReactNode } from "react";
interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[ErrorBoundary]", error, info); }
  reset = () => this.setState({ hasError: false, error: null });
  render() {
    if (this.state.hasError) return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 32 }}>
          <h2 style={{ color: "#1e293b", marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>{this.state.error?.message}</p>
          <button onClick={this.reset} style={{ background: "#2563eb", color: "white", border: "none", padding: "8px 20px", borderRadius: 8, cursor: "pointer" }}>Try again</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}
export default ErrorBoundary;
