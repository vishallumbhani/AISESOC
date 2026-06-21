import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import { assetApi, riskScoreApi } from "../../lib/apiClient";
import { Asset, RiskScore } from "../../lib/types";
import { FiArrowLeft, FiEdit2, FiTrash2 } from "react-icons/fi";

const AssetDetail: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Asset>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login");
      return;
    }
    if (id) {
      fetchAsset();
    }
  }, [id]);

  const fetchAsset = async () => {
    try {
      setLoading(true);
      setError(null);
      const assetResponse = await assetApi.get(id as string);
      setAsset(assetResponse.data);
      setEditData(assetResponse.data);

      try {
        const riskResponse = await assetApi.getRiskScore(id as string);
        setRiskScore(riskResponse.data);
      } catch {
        console.log("Risk score not available");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load asset");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await assetApi.update(id as string, editData);
      setAsset({ ...asset, ...editData } as Asset);
      setEditing(false);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update asset");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this asset?")) return;
    try {
      await assetApi.delete(id as string);
      router.push("/assets");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to delete asset");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "danger";
      case "high":
        return "warning";
      case "medium":
        return "info";
      case "low":
        return "success";
      default:
        return "default";
    }
  };

  if (loading) return <LoadingSpinner text="Loading asset..." />;
  if (!asset) return <Alert type="error" message="Asset not found" />;

  return (
    <>
      <Head>
        <title>{asset.name} - AI-SecOS</title>
      </Head>

      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button */}
          <Link href="/assets" className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-6">
            <FiArrowLeft className="w-5 h-5" />
            <span>Back to Assets</span>
          </Link>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

          {/* Asset Header */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{asset.name}</h1>
                <p className="text-gray-600 mt-2">{asset.description}</p>
                <div className="mt-4 flex items-center space-x-3">
                  <Badge text={asset.asset_type} type="info" />
                  <Badge text={asset.status} type="success" />
                </div>
              </div>
              <div className="flex space-x-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditing(!editing)}
                  className="flex items-center space-x-1"
                >
                  <FiEdit2 className="w-4 h-4" />
                  <span>{editing ? "Cancel" : "Edit"}</span>
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  className="flex items-center space-x-1"
                >
                  <FiTrash2 className="w-4 h-4" />
                  <span>Delete</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          {editing && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Asset</h2>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editData.name || ""}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editData.description || ""}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    className="input-field"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editData.status || "active"}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                    className="input-field"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div className="flex space-x-3">
                  <Button type="submit" variant="primary" loading={submitting}>
                    Save Changes
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Risk Score */}
          {riskScore && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Risk Assessment</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-600 text-sm">Risk Score</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{riskScore.score.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Severity</p>
                  <Badge text={riskScore.severity} type={getSeverityColor(riskScore.severity) as any} />
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Environment</p>
                  <p className="text-gray-900 font-medium mt-1">{riskScore.environment}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Data Sensitivity</p>
                  <p className="text-gray-900 font-medium mt-1">{riskScore.data_sensitivity}%</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Permission Level</p>
                  <p className="text-gray-900 font-medium mt-1">{riskScore.permission_level}%</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Trust Score</p>
                  <p className="text-gray-900 font-medium mt-1">{riskScore.trust_score}%</p>
                </div>
              </div>
              {riskScore.recommendation && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm font-medium text-yellow-800">
                    <strong>Recommendation:</strong> {riskScore.recommendation}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          {asset.metadata && Object.keys(asset.metadata).length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Metadata</h2>
              <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-auto">
                {JSON.stringify(asset.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default AssetDetail;
