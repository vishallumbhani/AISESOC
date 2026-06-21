import React from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { useEffect } from "react";
import { FiBarChart3, FiDatabase, FiShield, FiZap, FiArrowRight } from "react-icons/fi";

const Dashboard: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      router.push("/login");
    }
  }, []);

  const stats = [
    { label: "Total Assets", value: "24", icon: FiDatabase, color: "bg-blue-500" },
    { label: "Active Agents", value: "8", icon: FiShield, color: "bg-green-500" },
    { label: "Policies", value: "12", icon: FiBarChart3, color: "bg-purple-500" },
    { label: "High Risk Assets", value: "3", icon: FiZap, color: "bg-red-500" },
  ];

  const quickActions = [
    { label: "View Assets", href: "/assets", description: "Manage your asset inventory" },
    { label: "Create Policy", href: "/policies", description: "Set access control policies" },
    { label: "Runtime Test", href: "/runtime", description: "Test agent access decisions" },
  ];

  return (
    <>
      <Head>
        <title>Dashboard - AI-SecOS</title>
      </Head>

      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-2">Welcome to AI-SecOS Security Operations</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-600 text-sm font-medium">{stat.label}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                    </div>
                    <div className={`${stat.color} p-3 rounded-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quickActions.map((action, index) => (
              <Link
                key={index}
                href={action.href}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  {action.label}
                  <FiArrowRight className="w-5 h-5 ml-auto" />
                </h3>
                <p className="text-gray-600 text-sm mt-2">{action.description}</p>
              </Link>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">System Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <span className="text-gray-700">Backend API</span>
                <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Operational
                </span>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <span className="text-gray-700">Database</span>
                <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Operational
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Graph Database</span>
                <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Operational
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default Dashboard;
