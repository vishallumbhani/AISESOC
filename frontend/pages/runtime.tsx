import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import { agentApi, assetApi, runtimeApi } from "../lib/apiClient";
import { Agent, Asset, RuntimeDecision } from "../lib/types";
import { FiZap } from "react-icons/fi";

const Runtime: React.FC = () => {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [decision, setDecision] = useState<RuntimeDecision | null>(null);

  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [action, setAction] = useState("access");

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [agentsRes, assetsRes] = await Promise.all([agentApi.list(), assetApi.list()]);
      setAgents(agentsRes.data);
      setAssets(assetsRes.data);
      if (agentsRes.data.length > 0) setSelectedAgent(agentsRes.data[0].id);
      if (assetsRes.data.length > 0) setSelectedAsset(assetsRes.data[0].id);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent || !selectedAsset) {
      setError("Please select both agent and asset");
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);
    setDecision(null);

    try {
      const response = await runtimeApi.makeDecision(selectedAgent, selectedAsset, action);
      setDecision(response.data);
      setSuccess("Runtime decision evaluated successfully");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to evaluate decision");
    } finally {
      setTesting(false);
    }
  };

  const getDecisionColor = (decision: string) => {
    return decision === "allow" ? "success" : "danger";
  };

  return (
    <>
      <Head>
        <title>Runtime Test - AI-SecOS</title>
      </Head>

      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-2">
              <FiZap className="w-8 h-8" />
              <span>Runtime Test</span>
            </h1>
            <p className="text-gray-600 mt-2">Test agent access decisions in real-time</p>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
          {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

          {/* Test Form */}
          {loading ? (
            <LoadingSpinner text="Loading agents and assets..." />
          ) : (
            <div className="bg-white rounded-lg shadow p-8">
              <form onSubmit={handleTest} className="space-y-6">
                {/* Agent Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Agent
                  </label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="input-field"
                    required
                  >
                    <option value="">-- Choose an agent --</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.agent_type || "agent"})
                      </option>
                    ))}
                  </select>
                  {agents.length === 0 && (
                    <p className="text-sm text-gray-500 mt-2">No agents available. Create one first.</p>
                  )}
                </div>

                {/* Asset Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Asset
                  </label>
                  <select
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                    className="input-field"
                    required
                  >
                    <option value="">-- Choose an asset --</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} ({asset.asset_type})
                      </option>
                    ))}
                  </select>
                  {assets.length === 0 && (
                    <p className="text-sm text-gray-500 mt-2">No assets available. Create one first.</p>
                  )}
                </div>

                {/* Action Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Action
                  </label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="input-field"
                  >
                    <option value="access">Access</option>
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="delete">Delete</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={testing}
                  className="w-full"
                  disabled={!selectedAgent || !selectedAsset}
                >
                  Evaluate Decision
                </Button>
              </form>

              {/* Decision Result */}
              {decision && (
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Decision Result</h2>

                  {/* Decision Card */}
                  <div className="mb-6 p-6 bg-gray-50 rounded-lg border-l-4 border-blue-600">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Access Decision</span>
                      <Badge
                        text={decision.decision.toUpperCase()}
                        type={getDecisionColor(decision.decision) as any}
                      />
                    </div>
                    <p className="text-gray-900 text-lg font-semibold mt-2">{decision.reason}</p>
                  </div>

                  {/* Risk Score */}
                  {decision.risk_score !== undefined && (
                    <div className="mb-6 grid grid-cols-2 gap-4">
                      <div className="p-4 bg-white rounded-lg border border-gray-200">
                        <p className="text-gray-600 text-sm">Risk Score</p>
                        <p className="text-2xl font-bold text-gray-900 mt-2">
                          {decision.risk_score.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Applied Policies */}
                  {decision.policies_applied && decision.policies_applied.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Applied Policies</h3>
                      <div className="space-y-2">
                        {decision.policies_applied.map((policy, index) => (
                          <div key={index} className="flex items-center p-3 bg-white rounded-lg border border-gray-200">
                            <span className="w-6 h-6 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs font-bold">
                              {index + 1}
                            </span>
                            <span className="ml-3 text-gray-900">{policy}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default Runtime;
