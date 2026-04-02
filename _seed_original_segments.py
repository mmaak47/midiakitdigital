"""Seed original 12 segments in production PostgreSQL."""
import paramiko
from secrets import VPS_HOST, VPS_USER, VPS_PASS

def ssh_exec(client, cmd, timeout=120):
    print(f'>>> {cmd[:120]}...' if len(cmd)>120 else f'>>> {cmd}')
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode('utf-8', 'ignore').strip()
    err = e.read().decode('utf-8', 'ignore').strip()
    if out: print(out)
    if err: print('[stderr]', err)
    print()
    return out, err

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(VPS_HOST, 22, VPS_USER, VPS_PASS, timeout=30)

sql = """
INSERT INTO segment_target_categories (segment_id, place_category, weight) VALUES
('clinica','pharmacy',10),('clinica','gym',8),('clinica','school',7),('clinica','shopping_mall',7),
('clinica','residential_building',9),('clinica','supermarket',6),('clinica','park',5),
('clinica','beauty_salon',6),('clinica','daycare',5),('clinica','medical_center',4),
('hospital','pharmacy',10),('hospital','residential_building',9),('hospital','bus_station',7),
('hospital','parking_lot',6),('hospital','shopping_mall',6),('hospital','supermarket',5),
('hospital','hotel',5),('hospital','gym',4),('hospital','restaurant',4),('hospital','clinic',4),
('escola','residential_building',10),('escola','daycare',8),('escola','bookstore',7),
('escola','stationery',7),('escola','supermarket',6),('escola','park',6),
('escola','bus_station',5),('escola','gym',5),('escola','restaurant',4),('escola','church',4),
('faculdade','coworking',9),('faculdade','library',8),('faculdade','restaurant',7),('faculdade','bus_station',7),
('faculdade','bookstore',7),('faculdade','gym',6),('faculdade','cafe',6),('faculdade','parking_lot',5),
('faculdade','bank',5),('faculdade','copy_shop',5),
('construtora','bank',10),('construtora','coworking',9),('construtora','office',8),('construtora','real_estate_agency',7),
('construtora','executive_restaurant',6),('construtora','luxury_condominium',8),
('construtora','shopping_mall',6),('construtora','hotel',5),('construtora','parking_lot',5),('construtora','gym',4),
('imobiliaria','bank',10),('imobiliaria','real_estate_agency',8),('imobiliaria','luxury_condominium',9),
('imobiliaria','office',7),('imobiliaria','coworking',7),('imobiliaria','shopping_mall',6),
('imobiliaria','executive_restaurant',6),('imobiliaria','gym',5),('imobiliaria','school',5),('imobiliaria','park',4),
('varejo','shopping_mall',10),('varejo','supermarket',9),('varejo','bus_station',8),
('varejo','parking_lot',7),('varejo','residential_building',7),('varejo','restaurant',6),
('varejo','bank',5),('varejo','beauty_salon',5),('varejo','pharmacy',4),('varejo','gas_station',4),
('restaurante','office',9),('restaurante','shopping_mall',8),('restaurante','residential_building',7),
('restaurante','gym',6),('restaurante','parking_lot',6),('restaurante','hotel',6),('restaurante','bus_station',5),
('restaurante','coworking',5),('restaurante','bar',5),('restaurante','movie_theater',4),
('contabilidade','office',10),('contabilidade','bank',9),('contabilidade','coworking',8),('contabilidade','business_center',8),
('contabilidade','registry_office',6),('contabilidade','restaurant',5),('contabilidade','parking_lot',5),
('contabilidade','law_firm',5),('contabilidade','real_estate_agency',4),('contabilidade','hotel',4),
('advocacia','court',10),('advocacia','registry_office',9),('advocacia','office',8),('advocacia','bank',7),
('advocacia','coworking',6),('advocacia','business_center',6),('advocacia','restaurant',5),
('advocacia','parking_lot',5),('advocacia','law_firm',5),('advocacia','hotel',4),
('industria','gas_station',8),('industria','auto_parts',7),('industria','logistics_center',9),
('industria','warehouse',8),('industria','truck_stop',7),('industria','restaurant',5),
('industria','bus_station',5),('industria','hardware_store',6),('industria','parking_lot',5),('industria','industrial_zone',9),
('automotivo','gas_station',10),('automotivo','parking_lot',9),('automotivo','auto_parts',8),
('automotivo','car_wash',7),('automotivo','shopping_mall',6),('automotivo','residential_building',6),
('automotivo','office',5),('automotivo','insurance_agency',5),('automotivo','bank',5),('automotivo','highway_access',7)
ON CONFLICT (segment_id, place_category) DO NOTHING;
"""

heredoc_cmd = "sudo -u postgres psql -d midiakit_prod <<'EOSQL'\n" + sql + "\nEOSQL"
ssh_exec(c, heredoc_cmd)

# Verify all segments
ssh_exec(c, 'sudo -u postgres psql -d midiakit_prod -c "SELECT segment_id, COUNT(*) FROM segment_target_categories GROUP BY segment_id ORDER BY segment_id;"')

c.close()
print("Done seeding original segments!")
