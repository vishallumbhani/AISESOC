import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import { assetApi } from "../../lib/apiClient";
import { Asset } from "../../lib/types";
import { FiPlus, FiSearch, FiChevronRight, FiLock } from "react-icons/fi";

// ── Classification config ─────────────────────────────────────
const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;

const CLASS_BADGE: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
  public:       "success",
  internal:     "info",
  confidential: "warning",
  restricted:   "danger",
};

const CLASS_ICON: Record<string, string> = {
  public:       "🌐",
  internal:     "🏢",
  confidential: "🔒",
  restricted:   "🚫",
};

const STATUS_COLOR: Record<string, "success" | "danger" | "warning" | "info" | "default"> = {
  active:      "success",
  inactive:    "danger",
  maintenance: "warning",
};

const Assets: React.FC = () => {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAsset, setNewAsset] = useState({
    name: "", description: "", asset_type: "database",
    status: "active", classification: "internal",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/login"); return; }
    fetchAssets();
  }, [classFilter]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const res = await assetApi.list(classFilter || undefined);
      setAssets(res.data);
    } catch (err: any) {
      setError("Failed to load assets");
    } finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await assetApi.create(newAsset as any);
      setNewAsset({ name: "", description: "", asset_type: "database", status: "active", classification: "internal" });
      setShowCreateForm(false);
      fetchAssets();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create asset");
    } finally { setSubmitting(false); }
  };

  const filtered = assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.asset_type.toLowerCase().includes(search.toLowerCase())
  );

  // Stats by classification
  const byClass = CLASSIFICATIONS.reduce((acc, c) => {
    acc[c] = assets.filter((a) => a.classification === c).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
      <Head><title>Assets - AI-SecOS</title></Head>
      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
              <p className="text-gray-500 mt-1 text-sm">Classified asset inventory</p>
            </div>
            <Button variant="primary" onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center space-x-2">
              <FiPlus className="w-5 h-5" /><span>New Asset</span>
            </Button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

          {/* Classification overview */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {CLASSIFICATIONS.map((c) => (
              <button key={c}
                onClick={() => setClassFilter(classFilter === c ? "" : c)}
                className={`rounded-xl p-4 text-left transition-all border-2 shadow-sm ${
                  classFilter === c ? "border-blue-500 bg-indigo-50" : "border-transparent bg-white hover:border-gray-200"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg">{CLASS_ICON[c]}</span>
                  <Badge text={c} type={CLASS_BADGE[c]} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{byClass[c]}</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{c}</p>
              </button>
            ))}
          </div>

          {/* Create form */}
          {showCreateForm && (
            <div className="bg-white rounded-xl shadow p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Create New Asset</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input type="text" value={newAsset.name}
                      onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                      className="input-field" placeholder="Production Database" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type</label>
                    <select value={newAsset.asset_type}
                      onChange={(e) => setNewAsset({ ...newAsset, asset_type: e.target.value })}
                      className="input-field">
                      {["database", "api", "storage", "server", "other"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <FiLock className="inline w-3.5 h-3.5 mr-1" />
                      Classification *
                    </label>
                    <select value={newAsset.classification}
                      onChange={(e) => setNewAsset({ ...newAsset, classification: e.target.value })}
                      className="input-field">
                      {CLASSIFICATIONS.map((c) => (
                        <option key={c} value={c}>{CLASS_ICON[c]} {c}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {newAsset.classification === "restricted" && "⚠ Highest sensitivity — risk score will be very high"}
                      {newAsset.classification === "confidential" && "Sensitive data — elevated risk score"}
                      {newAsset.classification === "internal" && "Internal use only"}
                      {newAsset.classification === "public" && "Public — lowest risk baseline"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={newAsset.status}
                      onChange={(e) => setNewAsset({ ...newAsset, status: e.target.value })}
                      className="input-field">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={newAsset.description}
                    onChange={(e) => setNewAsset({ ...newAsset, description: e.target.value })}
                    className="input-field" rows={2} />
                </div>

                <div className="flex space-x-3">
                  <Button type="submit" variant="primary" loading={submitting}>Create Asset</Button>
                  <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
                </div>
              </form>
            </div>
          )}

          {/* Search + filter */}
          <div className="mb-4 flex items-center space-x-3">
            <div className="flex-1 flex items-center border border-gray-300 rounded-xl bg-white px-4 py-2.5">
              <FiSearch className="w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search assets…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 ml-3 outline-none bg-transparent text-sm" />
            </div>
            {classFilter && (
              <button onClick={() => setClassFilter("")}
                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-3 py-2 flex items-center space-x-1">
                <FiSearch className="w-3.5 h-3.5" />
                <span className="capitalize">{classFilter}</span>
                <span>×</span>
              </button>
            )}
          </div>

          {/* Asset list */}
          {loading ? (
            <LoadingSpinner text="Loading assets…" />
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No assets found.</div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((asset) => (
                <Link key={asset.id} href={`/assets/${asset.id}`}
                  className="bg-white rounded-xl shadow hover:shadow-md transition-shadow p-5 group flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className="text-lg">{CLASS_ICON[asset.classification] || "📦"}</span>
                      <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                        {asset.name}
                      </h3>
                    </div>
                    <p className="text-gray-400 text-sm truncate pl-8">{asset.description}</p>
                    <div className="mt-2 pl-8 flex flex-wrap items-center gap-2">
                      <Badge text={asset.asset_type} type="default" />
                      <Badge text={asset.classification} type={CLASS_BADGE[asset.classification] || "default"} />
                      <Badge text={asset.status} type={STATUS_COLOR[asset.status] || "default"} />
                    </div>
                  </div>
                  <FiChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0 ml-4" />
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
