import { Plus, Trash2 } from "lucide-react";

export default function GroupTabs({ canDelete, groups, activeGroupId, onAddGroup, onDeleteGroup, onGroupChange }) {
  return (
    <div className="mb-5 min-w-0 overflow-x-auto border-b border-[#dfe8df]">
      <div className="flex min-w-max items-center gap-1" role="tablist" aria-label="Тайпалар">
        <button
          aria-selected={activeGroupId === "all"}
          className={`border-b-2 px-4 py-3 text-sm font-extrabold transition ${activeGroupId === "all" ? "border-forest bg-[#edf5ee] text-forest" : "border-transparent text-muted hover:bg-[#fafcf9]"}`}
          onClick={() => onGroupChange("all")}
          role="tab"
          type="button"
        >
          Бардык тайпалар
        </button>
        {groups.map((group) => (
          <div className="flex items-center" key={group.id}>
            <button
              aria-selected={activeGroupId === String(group.id)}
              className={`border-b-2 px-4 py-3 text-sm font-extrabold transition ${activeGroupId === String(group.id) ? "border-forest bg-[#edf5ee] text-forest" : "border-transparent text-muted hover:bg-[#fafcf9]"}`}
              onClick={() => onGroupChange(String(group.id))}
              role="tab"
              type="button"
            >
              {group.name}
            </button>
            {canDelete && <button aria-label={`${group.name} тайпасын өчүрүү`} className="border-b-2 border-transparent px-2 py-3 text-[#b9504c] hover:bg-[#fff0ed]" onClick={() => onDeleteGroup(group)} title="Тайпаны өчүрүү" type="button"><Trash2 size={14} /></button>}
          </div>
        ))}
        {onAddGroup && (
          <button className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-4 py-3 text-sm font-extrabold text-coral-dark transition hover:bg-[#fff4f1]" onClick={onAddGroup} type="button">
            <Plus size={16} />Жаңы тайпа кошуу
          </button>
        )}
      </div>
    </div>
  );
}
