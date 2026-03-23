#!/usr/bin/env python3
"""
extract_kalguur.py — 从 PathOfBuilding 的 LegionPassives.lua 提取 Kalguur (Heroic Tragedy) 数据，
并注入到 timeless-jewels 项目的 gzip JSON 数据文件中。

背景：
  - POE 3.28 Mirage League 新增了第 6 种永恒珠宝 "Heroic Tragedy" (Kalguur 阵营)
  - 上游数据源 go-pob-data.pages.dev 截止 3.27，缺少 3.28 数据
  - 本脚本直接解析 PathOfBuilding 社区版的 Lua 数据文件，作为补充数据源

使用方法：
  1. 确保已 clone PathOfBuilding 仓库到上层目录:
     git clone https://github.com/PathOfBuildingCommunity/PathOfBuilding ../PathOfBuilding
  2. 运行脚本:
     python3 extract_kalguur.py
  3. 脚本会自动修改 data/ 目录下的 4 个 gzip JSON 文件
  4. 之后需要运行 `go generate` 重新生成 possible_stats 和 TS 类型绑定

数据文件修改清单：
  - data/alternate_tree_versions.json.gz  — 添加 Kalguur 版本定义 (_key=6)
  - data/alternate_passive_skills.json.gz — 添加 27 个 Kalguur 节点 (24 notable + 3 keystone)
  - data/alternate_passive_additions.json.gz — 添加 2 个 ward addition
  - data/stats.json.gz — 添加缺失的 stat ID 定义

注意事项：
  - 脚本有幂等保护：如果 alternate_tree_versions 已存在 _key=6，会终止避免重复写入
  - 负数 stat 值 (如 -25) 需要手动转为 uint32 二补码 (4294967271)，Go 的 Stat1Min 等字段是 uint32 类型
  - stat key 的分配从当前最大 key + 1 开始递增，不会与已有数据冲突
"""

import json
import gzip
import re
import os
import sys

# ============================================================================
# 路径配置
# ============================================================================

# 脚本所在目录 (timeless-jewels/)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Go 项目的 data 目录，存放所有 gzip JSON 数据文件
DATA_DIR = os.path.join(BASE_DIR, "data")

# PathOfBuilding 的 Lua 数据文件路径
# LegionPassives.lua 包含所有永恒珠宝的节点定义 (按阵营分区)
LUA_FILE = os.path.join(
    BASE_DIR, "..", "PathOfBuilding",
    "src", "Data", "TimelessJewelData", "LegionPassives.lua"
)

# ============================================================================
# 工具函数
# ============================================================================


def load_gz(path):
    """从 gzip 压缩的 JSON 文件加载数据"""
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)


def save_gz(path, data):
    """将数据保存为 gzip 压缩的紧凑 JSON (无多余空格，节省体积)"""
    with gzip.open(path, 'wb') as f:
        f.write(json.dumps(data, separators=(',', ':')).encode('utf-8'))


# ============================================================================
# Lua 解析逻辑
# ============================================================================


def parse_kalguur_from_lua():
    """
    解析 LegionPassives.lua，提取所有 Kalguur 相关条目。

    Lua 文件结构 (每个阵营一个大 block):
      legionPassives[N] = {
        ["additions"] = { ... },   -- 小节点的 ward addition
        ["groups"]    = { ... },   -- 显示分组 (本脚本不需要)
        ["nodes"]     = { ... },   -- notable/keystone 替换节点
      }

    Kalguur 节点编号范围:
      - nodes: [156] ~ [182]，id 格式为 "kalguur_notable_N" 或 "kalguur_keystone_N"
      - additions: [31] ~ [32]，id 格式为 "kalguuran_small_ward" / "kalguuran_attribute_ward"

    每个节点包含:
      - ["id"]: 唯一字符串 ID
      - ["dn"]: 显示名称 (display name)
      - ["ks"]: true = keystone (核心天赋)
      - ["not"]: true = notable (值得注意的天赋)
      - ["icon"]: DDS 图标路径
      - ["sortedStats"]: stat ID 列表 (有序，对应 Stat1/Stat2/...)
      - ["stats"]: 每个 stat 的 index/min/max 详情

    Returns:
        tuple: (kalguur_nodes, kalguur_additions)
            - kalguur_nodes: 替换节点列表 (notable + keystone)
            - kalguur_additions: 小节点 addition 列表
    """
    with open(LUA_FILE, 'r') as f:
        content = f.read()

    # ---------- 解析 nodes 区段 ----------
    # nodes 区段在文件末尾，格式: ["nodes"] = { [N] = { ... }, ... }
    nodes_section_match = re.search(
        r'\["nodes"\]\s*=\s*\{(.+)\}\s*,?\s*\}$', content, re.DOTALL
    )
    if not nodes_section_match:
        print("ERROR: Could not find nodes section")
        return None, None

    nodes_section = nodes_section_match.group(1)

    # 匹配每个节点 block: [数字] = { ... },
    node_pattern = re.compile(r'\[(\d+)\]\s*=\s*\{(.*?)\n\t\t\},', re.DOTALL)

    kalguur_nodes = []
    for match in node_pattern.finditer(nodes_section):
        idx = int(match.group(1))   # Lua 数组索引
        block = match.group(2)      # 节点内容

        # 仅处理 id 以 "kalguur_" 开头的节点
        id_match = re.search(r'\["id"\]\s*=\s*"(kalguur_[^"]+)"', block)
        if not id_match:
            continue

        node_id = id_match.group(1)

        # 提取显示名称
        name_match = re.search(r'\["dn"\]\s*=\s*"([^"]+)"', block)
        name = name_match.group(1).strip() if name_match else ""

        # 判断节点类型: keystone > notable > small
        is_keystone = bool(re.search(r'\["ks"\]\s*=\s*true', block))
        is_notable = bool(re.search(r'\["not"\]\s*=\s*true', block))

        # 提取图标路径
        icon_match = re.search(r'\["icon"\]\s*=\s*"([^"]+)"', block)
        icon = icon_match.group(1) if icon_match else ""

        # 提取有序 stat ID 列表 (sortedStats)
        # 用于确定 stat 的显示顺序和 StatsKeys 映射
        sorted_stats = []
        ss_match = re.search(r'\["sortedStats"\]\s*=\s*\{([^}]+)\}', block)
        if ss_match:
            for sm in re.finditer(r'\[\d+\]\s*=\s*"([^"]+)"', ss_match.group(1)):
                sorted_stats.append(sm.group(1))

        # 提取每个 stat 的详细数据 (index, min, max)
        # Lua 格式: ["stats"] = { ["stat_id"] = { ["index"] = N, ["min"] = N, ["max"] = N }, ... }
        stats_data = {}
        stats_block_match = re.search(
            r'\["stats"\]\s*=\s*\{(.+?)(?:\n\t\t\t\},\s*$|\n\t\t\t\},\s*\n\t\t)',
            block, re.DOTALL
        )
        if stats_block_match:
            stats_block = stats_block_match.group(1)
            for stat_match in re.finditer(
                r'\["([^"]+)"\]\s*=\s*\{([^}]+)\}', stats_block
            ):
                stat_id = stat_match.group(1)
                stat_block = stat_match.group(2)

                # 提取 index (对应 Stat1/Stat2/Stat3/Stat4 的位置)
                idx_m = re.search(r'\["index"\]\s*=\s*(\d+)', stat_block)
                # min/max 定义了该 stat 在珠宝种子范围内的取值区间
                min_m = re.search(r'\["min"\]\s*=\s*(-?\d+)', stat_block)
                max_m = re.search(r'\["max"\]\s*=\s*(-?\d+)', stat_block)

                stats_data[stat_id] = {
                    'index': int(idx_m.group(1)) if idx_m else 0,
                    'min': int(min_m.group(1)) if min_m else 0,
                    'max': int(max_m.group(1)) if max_m else 0,
                }

        kalguur_nodes.append({
            'lua_idx': idx,            # 原始 Lua 数组索引
            'id': node_id,             # 唯一字符串 ID
            'name': name,              # 显示名称
            'is_keystone': is_keystone, # 是否为核心天赋
            'is_notable': is_notable,   # 是否为值得注意的天赋
            'icon': icon,              # DDS 图标路径
            'sorted_stats': sorted_stats, # 有序 stat ID 列表
            'stats': stats_data,       # stat 详情 {stat_id: {index, min, max}}
        })

    # ---------- 解析 additions 区段 ----------
    # additions 在 Lua 文件中位于 groups 和 nodes 之前
    # 格式: ["additions"] = { [N] = { ... }, ... },
    additions_section_match = re.search(
        r'\["additions"\]\s*=\s*\{(.+?)\},\s*\["groups"\]',
        content, re.DOTALL
    )
    if not additions_section_match:
        print("ERROR: Could not find additions section")
        return kalguur_nodes, None

    additions_section = additions_section_match.group(1)

    kalguur_additions = []
    for match in node_pattern.finditer(additions_section):
        idx = int(match.group(1))
        block = match.group(2)

        # 仅处理 id 以 "kalguur" 开头的 addition
        id_match = re.search(r'\["id"\]\s*=\s*"(kalguur[^"]+)"', block)
        if not id_match:
            continue

        add_id = id_match.group(1)
        name_match = re.search(r'\["dn"\]\s*=\s*"([^"]+)"', block)
        name = name_match.group(1) if name_match else ""

        # 提取有序 stat ID 列表
        sorted_stats = []
        ss_match = re.search(r'\["sortedStats"\]\s*=\s*\{([^}]+)\}', block)
        if ss_match:
            for sm in re.finditer(r'\[\d+\]\s*=\s*"([^"]+)"', ss_match.group(1)):
                sorted_stats.append(sm.group(1))

        # 提取 stat 详情 (注意 additions 的 stats 结构与 nodes 相同)
        stats_data = {}
        stats_outer = re.search(
            r'\["stats"\]\s*=\s*\{(.+?)\n\t\t\},', block, re.DOTALL
        )
        if stats_outer:
            for stat_match in re.finditer(
                r'\["([^"]+)"\]\s*=\s*\{([^}]+)\}', stats_outer.group(1)
            ):
                stat_id = stat_match.group(1)
                stat_block = stat_match.group(2)
                idx_m = re.search(r'\["index"\]\s*=\s*(\d+)', stat_block)
                min_m = re.search(r'\["min"\]\s*=\s*(-?\d+)', stat_block)
                max_m = re.search(r'\["max"\]\s*=\s*(-?\d+)', stat_block)
                if idx_m:
                    stats_data[stat_id] = {
                        'index': int(idx_m.group(1)),
                        'min': int(min_m.group(1)) if min_m else 0,
                        'max': int(max_m.group(1)) if max_m else 0,
                    }

        kalguur_additions.append({
            'lua_idx': idx,
            'id': add_id,
            'name': name,
            'sorted_stats': sorted_stats,
            'stats': stats_data,
        })

    return kalguur_nodes, kalguur_additions


# ============================================================================
# 主流程：解析 Lua → 注入 JSON 数据文件
# ============================================================================


def main():
    print("=== Extracting Kalguur data from LegionPassives.lua ===\n")

    # ---- 步骤 1: 解析 Lua 文件 ----
    kalguur_nodes, kalguur_additions = parse_kalguur_from_lua()

    if not kalguur_nodes:
        print("ERROR: No kalguur nodes found!")
        sys.exit(1)

    # 打印解析结果摘要
    print(f"Found {len(kalguur_nodes)} kalguur nodes:")
    for n in kalguur_nodes:
        kind = "KS" if n['is_keystone'] else ("NOT" if n['is_notable'] else "SMALL")
        print(f"  [{n['lua_idx']}] {n['id']} - {n['name']} ({kind}) "
              f"stats={n['sorted_stats']}")

    if kalguur_additions:
        print(f"\nFound {len(kalguur_additions)} kalguur additions:")
        for a in kalguur_additions:
            print(f"  [{a['lua_idx']}] {a['id']} - {a['name']} "
                  f"stats={a['sorted_stats']}")

    # ---- 步骤 2: 加载现有数据文件 ----
    alt_tree_versions = load_gz(
        os.path.join(DATA_DIR, "alternate_tree_versions.json.gz")
    )
    alt_passive_skills = load_gz(
        os.path.join(DATA_DIR, "alternate_passive_skills.json.gz")
    )
    alt_passive_additions = load_gz(
        os.path.join(DATA_DIR, "alternate_passive_additions.json.gz")
    )
    stats_data = load_gz(os.path.join(DATA_DIR, "stats.json.gz"))

    # ---- 幂等保护: 检查是否已存在 Kalguur 数据 ----
    if any(v['_key'] == 6 for v in alt_tree_versions):
        print("\nKalguur already exists in data, aborting.")
        return

    # ---- 步骤 3: 注册缺失的 stat 定义 ----
    # 构建 stat ID → key 的映射表
    stats_map = {s['Id']: s['_key'] for s in stats_data}
    max_stat_key = max(s['_key'] for s in stats_data)

    # 收集 Kalguur 节点和 additions 用到的所有 stat ID
    all_needed_stats = set()
    for n in kalguur_nodes:
        for sid in n['sorted_stats']:
            all_needed_stats.add(sid)
    if kalguur_additions:
        for a in kalguur_additions:
            for sid in a['sorted_stats']:
                all_needed_stats.add(sid)

    # 检查并添加缺失的 stat
    # 已存在的 stat 直接复用 key，新 stat 从 max_key+1 开始分配
    print(f"\n--- Checking {len(all_needed_stats)} required stats ---")
    next_stat_key = max_stat_key + 1
    for sid in sorted(all_needed_stats):
        if sid in stats_map:
            print(f"  OK: {sid} = {stats_map[sid]}")
        else:
            # 新增 stat 条目，Text 用 ID 作占位符
            stats_data.append({
                "_key": next_stat_key,
                "Id": sid,
                "Text": sid,
                "Category": None,
            })
            stats_map[sid] = next_stat_key
            print(f"  NEW: {sid} = {next_stat_key}")
            next_stat_key += 1

    # ---- 步骤 4: 添加 Kalguur AlternateTreeVersion ----
    # 定义 Kalguur 阵营的版本参数：
    #   Var1=false: 小属性节点不被替换 (保留原始 +10 str/dex/int)
    #   Var2=false: 小普通节点不被替换 (保留原始效果)
    #   Var5=Var6=1: 每个受影响节点获得 1 条 addition (ward 加成)
    #   Var9=100: 所有 notable 都会被替换 (100% spawn weight)
    print("\n--- Adding Kalguur AlternateTreeVersion ---")
    alt_tree_versions.append({
        "_key": 6,
        "Id": "Kalguur",
        "Var1": False,   # AreSmallAttributePassiveSkillsReplaced
        "Var2": False,   # AreSmallNormalPassiveSkillsReplaced
        "Var3": 0,
        "Var4": 0,
        "Var5": 1,       # MinimumAdditions
        "Var6": 1,       # MaximumAdditions
        "Var7": 0,
        "Var8": 0,
        "Var9": 100,     # NotableReplacementSpawnWeight (100 = 全部替换)
    })
    print("  Added Kalguur version (key=6)")

    # ---- 步骤 5: 添加 Kalguur 替换节点 (notable + keystone) ----
    # 征服者与 keystone 的对应关系 (来自 PathOfBuilding):
    #   kalguur_keystone_1 → Vorana   (conqueror_index=1) → Black Scythe Training
    #   kalguur_keystone_2 → Uhtred   (conqueror_index=2) → Celestial Mathematics
    #   kalguur_keystone_3 → Medved   (conqueror_index=3) → The Unbreaking Circle
    print(f"\n--- Adding {len(kalguur_nodes)} kalguur passive skills ---")
    next_skill_key = max(s['_key'] for s in alt_passive_skills) + 1

    for node in kalguur_nodes:
        # 确定 PassiveType: 4=keystone, 3=notable, 2=small
        if node['is_keystone']:
            passive_type = [4]
        elif node['is_notable']:
            passive_type = [3]
        else:
            passive_type = [2]

        # Keystone 需要设置征服者索引 (Var18)
        # 根据 id 末尾数字判断: keystone_1=Vorana, keystone_2=Uhtred, keystone_3=Medved
        conqueror_index = 0
        conqueror_version = 0
        if node['is_keystone']:
            ks_num = int(re.search(r'(\d+)$', node['id']).group(1))
            conqueror_index = ks_num
            conqueror_version = 0

        # 按 index 排序 stat，构建 StatsKeys 数组和对应的 min/max 值
        # index 字段对应游戏内部的 Stat1/Stat2/Stat3/Stat4 位置
        stat_by_index = {}
        for sid, sdata in node['stats'].items():
            stat_by_index[sdata['index']] = (sid, sdata)

        stats_keys = []
        stat_min_max = [(0, 0)] * 4  # 最多 4 个 stat 位
        for i in sorted(stat_by_index.keys()):
            sid, sdata = stat_by_index[i]
            stats_keys.append(stats_map[sid])
            idx = len(stats_keys) - 1
            if idx < 4:
                stat_min_max[idx] = (sdata['min'], sdata['max'])

        # 构建 AlternatePassiveSkill 条目
        # 字段说明:
        #   Stat1Min/Max ~ Var11/Var12: 对应 Stat1~Stat4 的取值范围
        #   SpawnWeight: 出现权重 (100 = 正常概率)
        #   Var18: 征服者索引 (仅 keystone 使用)
        #   Var24: 征服者版本 (0 = 默认)
        #   Var25: 特殊标记 (首个征服者的 keystone 为 100)
        entry = {
            "_key": next_skill_key,
            "Id": node['id'],
            "AlternateTreeVersionsKey": 6,  # Kalguur
            "Name": node['name'],
            "PassiveType": passive_type,
            "StatsKeys": stats_keys,
            "Stat1Min": stat_min_max[0][0],
            "Stat1Max": stat_min_max[0][1],
            "Stat2Min": stat_min_max[1][0],
            "Stat2Max": stat_min_max[1][1],
            "Var9": stat_min_max[2][0],      # Stat3Min
            "Var10": stat_min_max[2][1],     # Stat3Max
            "Var11": stat_min_max[3][0],     # Stat4Min
            "Var12": stat_min_max[3][1],     # Stat4Max
            "Var13": 0,
            "Var14": 0,
            "Var15": 0,
            "Var16": 0,
            "SpawnWeight": 100,
            "Var18": conqueror_index,
            "RandomMin": 0,
            "RandomMax": 0,
            "FlavourText": "",
            "DDSIcon": node['icon'],
            "AchievementItemsKeys": [],
            "Var24": conqueror_version,
            "Var25": 100 if (node['is_keystone'] and conqueror_index == 1) else 0,
        }

        alt_passive_skills.append(entry)
        kind = "keystone" if node['is_keystone'] else "notable"
        print(f"  [{next_skill_key}] {node['name']} ({kind})")
        next_skill_key += 1

    # ---- 步骤 6: 添加 Kalguur additions (小节点 ward 加成) ----
    # Kalguur 的 addition 规则:
    #   - kalguuran_small_ward: 小普通节点 (PassiveType=2) 获得 +2% ward
    #   - kalguuran_attribute_ward: 小属性节点 (PassiveType=1) 获得 +1% ward
    if kalguur_additions:
        print(f"\n--- Adding {len(kalguur_additions)} kalguur additions ---")
        next_add_key = max(a['_key'] for a in alt_passive_additions) + 1

        for addition in kalguur_additions:
            # 根据 id 判断目标节点类型
            # "attribute" → 小属性节点 (PassiveType=1: +str/+dex/+int)
            # 其他 → 小普通节点 (PassiveType=2)
            if 'attribute' in addition['id']:
                passive_type = [1]
            else:
                passive_type = [2]

            # 按 index 排序 stat，构建 StatsKeys
            stat_by_index = {}
            for sid, sdata in addition['stats'].items():
                stat_by_index[sdata['index']] = (sid, sdata)

            stats_keys = []
            stat_min_max = [(0, 0)] * 2  # addition 最多 2 个 stat
            for i in sorted(stat_by_index.keys()):
                sid, sdata = stat_by_index[i]
                stats_keys.append(stats_map[sid])
                idx = len(stats_keys) - 1
                if idx < 2:
                    stat_min_max[idx] = (sdata['min'], sdata['max'])

            # 构建 AlternatePassiveAddition 条目
            entry = {
                "_key": next_add_key,
                "Id": addition['id'],
                "AlternateTreeVersionsKey": 6,  # Kalguur
                "SpawnWeight": 100,
                "StatsKeys": stats_keys,
                "Stat1Min": stat_min_max[0][0],
                "Stat1Max": stat_min_max[0][1],
                "Var6": stat_min_max[1][0],      # Stat2Min
                "Var7": stat_min_max[1][1],       # Stat2Max
                "Var8": 0,
                "Var9": 0,
                "PassiveType": passive_type,
                "Var11": 0,
            }

            alt_passive_additions.append(entry)
            print(f"  [{next_add_key}] {addition['id']} - {addition['name']}")
            next_add_key += 1

    # ---- 步骤 7: 保存所有修改后的数据文件 ----
    print("\n=== Saving updated data files ===")

    save_gz(
        os.path.join(DATA_DIR, "alternate_tree_versions.json.gz"),
        alt_tree_versions,
    )
    print(f"  alternate_tree_versions: {len(alt_tree_versions)} entries")

    save_gz(
        os.path.join(DATA_DIR, "alternate_passive_skills.json.gz"),
        alt_passive_skills,
    )
    print(f"  alternate_passive_skills: {len(alt_passive_skills)} entries")

    save_gz(
        os.path.join(DATA_DIR, "alternate_passive_additions.json.gz"),
        alt_passive_additions,
    )
    print(f"  alternate_passive_additions: {len(alt_passive_additions)} entries")

    save_gz(os.path.join(DATA_DIR, "stats.json.gz"), stats_data)
    print(f"  stats: {len(stats_data)} entries")

    print("\n=== Done! ===")
    print("\nNext steps:")
    print("  1. cd timeless-jewels && go generate  # 重新生成 possible_stats 和 TS 类型")
    print("  2. GOOS=js GOARCH=wasm go build -ldflags='-s -w' "
          "-o frontend/static/calculator.wasm ./wasm  # 构建 WASM")


if __name__ == "__main__":
    main()
