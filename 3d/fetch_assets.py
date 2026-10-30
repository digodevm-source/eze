"""Download the CC0 Poly Haven assets used by the render scenes
(HDRI skies, textures, vegetation and props) into $GGD_ASSETS."""
import json, sys, os, urllib.request, concurrent.futures as cf
UA={'User-Agent':'ggd-site-builder/1.0'}
ROOT=os.environ.get('GGD_ASSETS', '/opt/assets')
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA)))
def dl(url, path):
    if os.path.exists(path) and os.path.getsize(path)>0: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp=path+'.part'
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r, open(tmp,'wb') as f:
        while True:
            b=r.read(1<<20)
            if not b: break
            f.write(b)
    os.rename(tmp,path)
jobs=[]
models={'1k':['pine_tree_01','fir_tree_01','fir_sapling_medium','island_tree_01','island_tree_02','tree_small_02','shrub_01','shrub_02','shrub_03','shrub_04','grass_medium_01','grass_medium_02','boulder_01','cement_bag','trowel_01'],
        '2k':['potted_plant_02','potted_plant_04','ceramic_vase_01','ceramic_vase_03','planter_pot_clay','mid_century_lounge_chair']}
for res, ids in models.items():
    for a in ids:
        d=get(f'https://api.polyhaven.com/files/{a}')['blend'][res]['blend']
        base=f'{ROOT}/models/{a}'
        jobs.append((d['url'], f'{base}/{a}.blend'))
        for rel,v in d.get('include',{}).items():
            jobs.append((v['url'], f'{base}/{rel}'))
hdris={'kloppenheim_06_puresky':'4k','belfast_sunset_puresky':'4k','qwantani_late_afternoon_puresky':'4k','kloofendal_48d_partly_cloudy_puresky':'4k','citrus_orchard_puresky':'4k','qwantani_dusk_2_puresky':'4k','brown_photostudio_02':'2k','studio_small_09':'2k'}
for a,res in hdris.items():
    d=get(f'https://api.polyhaven.com/files/{a}')['hdri'][res]['hdr']
    jobs.append((d['url'], f'{ROOT}/hdri/{a}.hdr'))
tex=['white_plaster_02','plaster_grey_04','clay_plaster','white_plaster_rough_01','white_oak_veneer','smoked_walnut_veneer','oak_wood_planks','plank_flooring_02','laminate_floor_02','smooth_concrete_floor','square_concrete_pavers','large_grey_tiles','gravel_floor_02','leafy_grass','sparse_grass','forest_ground_04','farm_soil','rough_linen','terry_cloth','marble_01','terrazzo_tiles','sandstone_cracks','slab_tiles','concrete_floor_02','grass_path_2']
for a in tex:
    d=get(f'https://api.polyhaven.com/files/{a}')
    for m in ('Diffuse','nor_gl','Rough','AO','Displacement'):
        if m in d and '2k' in d[m]:
            fmt='jpg' if 'jpg' in d[m]['2k'] else 'png'
            jobs.append((d[m]['2k'][fmt]['url'], f'{ROOT}/tex/{a}/{a}_{m}.{fmt}'))
print(len(jobs),'files')
with cf.ThreadPoolExecutor(8) as ex:
    futs=[ex.submit(dl,u,p) for u,p in jobs]
    for f in cf.as_completed(futs):
        try: f.result()
        except Exception as e: print('ERR',e)
print('done')
