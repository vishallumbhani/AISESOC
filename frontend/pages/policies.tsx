import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import { policyApi } from "../lib/apiClient";
import { Policy } from "../lib/types";
import { FiPlus, FiSearch, FiChevronRight } from "react-icons/fi";

const Policies: React.FC = () => {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    name: "",
    description: "",
    policy_type: "access_control",
    status: "active",
    priority: 100,
    rules: JSON.stringify({ allow: [], deny: [] }),
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await policyApi.list();
      setPolicies(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load policies");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const rulesObj = JSON.parse(newPolicy.rules);
      await policyApi.create({
        ...newPolicy,
        rules: rulesObj,
      });
      setNewPolicy({
        name: "",
        description: "",
        policy_type: "access_control",
        status: "active",
        priority: 100,
        rules: JSON.stringify({ allow: [], deny: [] }),
      });
      setShowCreateForm(false);
      fetchPolicies();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create policy");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPolicies = policies.filter(
    (policy) =>
      policy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      policy.policy_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Head>
        <title>Policies - AI-SecOS</title>
      </Head>

      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Policies</h1>
              <p className="text-gray-600 mt-2">Manage access control policies</p>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center space-x-2"
            >
              <FiPlus className="w-5 h-5" />
              <span>New Policy</span>
            </Button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Policy</h2>
              <form onSubmit={handleCreatePolicy} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Policy Name
                    </label>
                    <input
                      type="text"
                      value={newPolicy.name}
                      onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
                      className="input-field"
                      placeholder="e.g., Production Access Policy"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Policy Type
                    </label>
                    <select
                      value={newPolicy.policy_type}
                      onChange={(e) => setNewPolicy({ ...newPolicy, policy_type: e.target.value })}
                      className="input-field"
                    >
                      <option value="access_control">Access Control</option>
                      <option value="security">Security</option>
                      <option value="compliance">Compliance</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newPolicy.description}
                    onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })}
                    className="input-field"
                    placeholder="Policy description"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rules (JSON)
                  </label>
                  <textarea
                    value={newPolicy.rules}
                    onChange={(e) => setNewPolicy({ ...newPolicy, rules: e.target.value })}
                    className="input-field font-mono text-sm"
                    placeholder='{"allow": ["agent:*"], "deny": ["agent:admin"]}'
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <input
                      type="number"
                      value={newPolicy.priority}
                      onChange={(e) => setNewPolicy({ ...newPolicy, priority: parseInt(e.target.value) })}
                      className="input-field"
                      min="1"
                      max="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={newPolicy.status}
                      onChange={(e) => setNewPolicy({ ...newPolicy, status: e.target.value })}
                      className="input-field"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="flex space-x-3">
                  <Button type="submit" variant="primary" loading={submitting}>
                    Create Policy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Search */}
          <div className="mb-6">
            <div className="flex items-center border border-gray-300 rounded-lg bg-white px-4 py-2">
              <FiSearch className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search policies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 ml-3 outline-none border-0 bg-transparent"
              />
            </div>
          </div>

          {/* Policies List */}
          {loading ? (
            <LoadingSpinner text="Loading policies..." />
          ) : filteredPolicies.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-600">No policies found</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredPolicies.map((policy) => (
                <div
                  key={policy.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {policy.name}
                      </h3>
                      <p className="text-gray-600 text-sm mt-1">{policy.description}</p>
                      <div className="mt-4 flex items-center space-x-4">
                        <Badge text={policy.policy_type || "Policy"} type="info" />
                        <Badge text={policy.status} type={policy.status === "active" ? "success" : "danger"} />
                        <span className="text-sm text-gray-500">Priority: {policy.priority}</span>
                      </div>
                    </div>
                    <FiChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default Policies;
