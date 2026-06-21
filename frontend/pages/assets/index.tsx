import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import { assetApi } from "../lib/apiClient";
import { Asset } from "../lib/types";
import { FiPlus, FiSearch, FiChevronRight } from "react-icons/fi";

const Assets: React.FC = () => {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: "",
    description: "",
    asset_type: "server",
    status: "active",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await assetApi.list();
      setAssets(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await assetApi.create(newAsset);
      setNewAsset({ name: "", description: "", asset_type: "server", status: "active" });
      setShowCreateForm(false);
      fetchAssets();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create asset");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAssets = assets.filter(
    (asset) =>
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.asset_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "inactive":
        return "danger";
      case "maintenance":
        return "warning";
      default:
        return "info";
    }
  };

  return (
    <>
      <Head>
        <title>Assets - AI-SecOS</title>
      </Head>

      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
              <p className="text-gray-600 mt-2">Manage your asset inventory</p>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center space-x-2"
            >
              <FiPlus className="w-5 h-5" />
              <span>New Asset</span>
            </Button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Asset</h2>
              <form onSubmit={handleCreateAsset} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asset Name
                    </label>
                    <input
                      type="text"
                      value={newAsset.name}
                      onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                      className="input-field"
                      placeholder="e.g., Production Database"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asset Type
                    </label>
                    <select
                      value={newAsset.asset_type}
                      onChange={(e) => setNewAsset({ ...newAsset, asset_type: e.target.value })}
                      className="input-field"
                    >
                      <option value="server">Server</option>
                      <option value="database">Database</option>
                      <option value="api">API</option>
                      <option value="storage">Storage</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newAsset.description}
                    onChange={(e) => setNewAsset({ ...newAsset, description: e.target.value })}
                    className="input-field"
                    placeholder="Asset description"
                    rows={3}
                  />
                </div>
                <div className="flex space-x-3">
                  <Button type="submit" variant="primary" loading={submitting}>
                    Create Asset
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
                placeholder="Search assets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 ml-3 outline-none border-0 bg-transparent"
              />
            </div>
          </div>

          {/* Assets List */}
          {loading ? (
            <LoadingSpinner text="Loading assets..." />
          ) : filteredAssets.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-600">No assets found</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredAssets.map((asset) => (
                <Link
                  key={asset.id}
                  href={`/assets/${asset.id}`}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {asset.name}
                      </h3>
                      <p className="text-gray-600 text-sm mt-1">{asset.description}</p>
                      <div className="mt-4 flex items-center space-x-4">
                        <Badge text={asset.asset_type} type="info" />
                        <Badge text={asset.status} type={getStatusColor(asset.status) as any} />
                      </div>
                    </div>
                    <FiChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default Assets;
