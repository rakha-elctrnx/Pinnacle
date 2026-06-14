import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { SqlTableListItem } from "../../../types";
import { CenteredLoadingState } from "../../shared/CenteredLoadingState";

interface SqlTableListProps {
  rows: SqlTableListItem[];
  loading: boolean;
  onSelectTable: (tableName: string) => void;
  onCreateTable: (tableName: string) => Promise<void> | void;
  onEditTable: (
    tableName: string,
    nextTableName: string,
  ) => Promise<void> | void;
  onDeleteTable: (tableName: string) => Promise<void> | void;
}

type SortField = "tableName" | "oid" | "owner" | "tableType" | "rowCount";
type SortDirection = "asc" | "desc";

export function SqlTableList({
  rows,
  loading,
  onSelectTable,
  onCreateTable,
  onEditTable,
  onDeleteTable,
}: SqlTableListProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("tableName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedTableName, setSelectedTableName] = useState<string | null>(
    null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTableName, setCreateTableName] = useState("");
  const [showEditForm, setShowEditForm] = useState(false);
  const [nextTableName, setNextTableName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const searched = normalizedSearch
      ? rows.filter((row) => {
          return (
            row.tableName.toLowerCase().includes(normalizedSearch) ||
            row.owner.toLowerCase().includes(normalizedSearch) ||
            row.tableType.toLowerCase().includes(normalizedSearch)
          );
        })
      : rows;

    return [...searched].sort((a, b) => {
      const aVal = String(a[sortField] ?? "");
      const bVal = String(b[sortField] ?? "");

      if (sortField === "rowCount") {
        const aNum = Number(a.rowCount) || 0;
        const bNum = Number(b.rowCount) || 0;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }

      return sortDirection === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [rows, search, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1 text-slate-400">
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const handleRowSelection = (tableName: string) => {
    setSelectedTableName((prev) => (prev === tableName ? null : tableName));
    setShowEditForm(false);
    setShowDeleteConfirm(false);
    setActionError(null);
  };

  const resetInlineForms = () => {
    setShowCreateForm(false);
    setShowEditForm(false);
    setShowDeleteConfirm(false);
    setCreateTableName("");
    setNextTableName("");
  };

  const handleCreateTable = async () => {
    const trimmedName = createTableName.trim();
    if (!trimmedName) {
      setActionError("Table name is required");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      await onCreateTable(trimmedName);
      setSelectedTableName(trimmedName);
      resetInlineForms();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEdit = () => {
    if (!selectedTableName) return;
    setNextTableName(selectedTableName);
    setShowDeleteConfirm(false);
    setShowCreateForm(false);
    setShowEditForm(true);
    setActionError(null);
  };

  const handleEditTable = async () => {
    if (!selectedTableName) return;
    const trimmedNext = nextTableName.trim();
    if (!trimmedNext) {
      setActionError("New table name is required");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      await onEditTable(selectedTableName, trimmedNext);
      setSelectedTableName(trimmedNext);
      resetInlineForms();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!selectedTableName) return;

    setActionLoading(true);
    setActionError(null);
    try {
      await onDeleteTable(selectedTableName);
      setSelectedTableName(null);
      resetInlineForms();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section 
      className="flex h-full min-h-0 flex-col overflow-hidden bg-white"
      onClick={() => {
        if (selectedTableName) {
          setSelectedTableName(null);
          setShowEditForm(false);
          setShowDeleteConfirm(false);
          setActionError(null);
        }
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-1.5 py-1.5">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setShowEditForm(false);
              setShowDeleteConfirm(false);
              setActionError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-blue-600 transition-colors hover:bg-slate-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New Table
          </button>

          <>
            <button
              type="button"
              onClick={handleStartEdit}
              disabled={!selectedTableName}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Design Table
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(true);
                setShowEditForm(false);
                setShowCreateForm(false);
                setActionError(null);
              }}
              disabled={!selectedTableName}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </button>
          </>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64 rounded-md border border-slate-200 bg-white py-1 pl-7 pr-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>

      {showCreateForm && (
        <div 
          className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            placeholder="New table name"
            value={createTableName}
            onChange={(event) => setCreateTableName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleCreateTable();
              }
            }}
            className="w-64 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleCreateTable()}
            disabled={actionLoading}
            className="rounded bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(false);
              setCreateTableName("");
              setActionError(null);
            }}
            className="rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      {showEditForm && selectedTableName && (
        <div 
          className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="shrink-0 text-xs text-slate-500">Rename:</span>
          <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono text-slate-700">
            {selectedTableName}
          </span>
          <span className="shrink-0 text-xs text-slate-400">to</span>
          <input
            type="text"
            placeholder="New table name"
            value={nextTableName}
            onChange={(event) => setNextTableName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleEditTable();
              }
            }}
            className="w-56 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleEditTable()}
            disabled={actionLoading}
            className="rounded bg-blue-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setShowEditForm(false);
              setNextTableName("");
              setActionError(null);
            }}
            className="rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      {showDeleteConfirm && selectedTableName && (
        <div 
          className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700"
          onClick={(e) => e.stopPropagation()}
        >
          <span>
            Delete table <span className="font-mono">{selectedTableName}</span>?
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleDeleteTable()}
              disabled={actionLoading}
              className="rounded bg-red-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div 
          className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && (
        <CenteredLoadingState loading={loading} label="Loading tables..." />
      )}

      {!loading && (
        <div 
          className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-slate-200 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-50"
          onClick={(e) => e.stopPropagation()}
        >
          <table
            className="w-full border-collapse text-xs"
            style={{ tableLayout: "fixed" }}
          >
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-[0_1px_0_0_var(--color-slate-200)]">
              <tr className="text-left text-slate-600">
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  onClick={() => toggleSort("tableName")}
                >
                  Table Name {sortIndicator("tableName")}
                </th>
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 90 }}
                  onClick={() => toggleSort("oid")}
                >
                  OID {sortIndicator("oid")}
                </th>
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 150 }}
                  onClick={() => toggleSort("owner")}
                >
                  Owner {sortIndicator("owner")}
                </th>
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 150 }}
                  onClick={() => toggleSort("tableType")}
                >
                  Table Type {sortIndicator("tableType")}
                </th>
                <th
                  className="cursor-pointer border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 120 }}
                  onClick={() => toggleSort("rowCount")}
                >
                  Rows {sortIndicator("rowCount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-8 text-center text-slate-400"
                  >
                    No tables found
                  </td>
                </tr>
              )}

              {filteredRows.map((row) => {
                const isSelected = selectedTableName === row.tableName;

                return (
                  <tr
                    key={row.tableName}
                    className={[
                      "cursor-pointer text-slate-700 even:bg-slate-50/50 hover:bg-blue-50/40",
                      isSelected ? "bg-blue-100/70! even:bg-blue-100/70!" : "",
                    ].join(" ")}
                    onClick={() => handleRowSelection(row.tableName)}
                  >
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectTable(row.tableName);
                        }}
                        className="font-mono text-blue-600 hover:text-blue-500 hover:underline"
                      >
                        {row.tableName}
                      </button>
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 font-mono text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.oid}
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.owner}
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.tableType}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-right font-mono text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {row.rowCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
