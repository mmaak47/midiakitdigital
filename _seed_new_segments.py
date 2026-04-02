"""Seed new segment_target_categories in production PostgreSQL."""
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
('fitness','residential_building',10),('fitness','supplement_store',8),('fitness','park',7),
('fitness','shopping_mall',7),('fitness','restaurant',6),('fitness','supermarket',6),
('fitness','pharmacy',5),('fitness','beauty_salon',5),('fitness','sports_center',8),('fitness','office',4),
('beleza','shopping_mall',10),('beleza','residential_building',9),('beleza','pharmacy',7),
('beleza','gym',7),('beleza','restaurant',6),('beleza','supermarket',6),
('beleza','spa',5),('beleza','barber_shop',5),('beleza','beauty_salon',4),('beleza','office',4),
('pet','park',10),('pet','residential_building',10),('pet','supermarket',7),
('pet','veterinary',6),('pet','pet_shop',5),('pet','pharmacy',5),
('pet','beauty_salon',4),('pet','school',4),('pet','shopping_mall',4),('pet','bus_station',3),
('farmacia','medical_center',10),('farmacia','clinic',9),('farmacia','residential_building',9),
('farmacia','supermarket',7),('farmacia','gym',6),('farmacia','beauty_salon',5),
('farmacia','bus_station',5),('farmacia','school',5),('farmacia','park',4),('farmacia','shopping_mall',4),
('supermercado','residential_building',10),('supermercado','school',8),('supermercado','bus_station',7),
('supermercado','gas_station',6),('supermercado','pharmacy',6),('supermercado','park',5),
('supermercado','church',5),('supermercado','daycare',5),('supermercado','restaurant',4),('supermercado','parking_lot',4),
('financeiro','office',10),('financeiro','bank',9),('financeiro','shopping_mall',8),
('financeiro','coworking',7),('financeiro','business_center',7),('financeiro','restaurant',6),
('financeiro','parking_lot',6),('financeiro','real_estate_agency',5),('financeiro','hotel',4),('financeiro','law_firm',4),
('turismo','hotel',10),('turismo','airport',9),('turismo','bus_station',8),
('turismo','tourist_attraction',8),('turismo','restaurant',7),('turismo','travel_agency',6),
('turismo','shopping_mall',6),('turismo','bar',5),('turismo','parking_lot',5),('turismo','park',5),
('coworking','cafe',10),('coworking','restaurant',8),('coworking','bank',7),
('coworking','office',7),('coworking','bus_station',6),('coworking','parking_lot',6),
('coworking','gym',5),('coworking','hotel',5),('coworking','library',5),('coworking','shopping_mall',4),
('tecnologia','coworking',10),('tecnologia','university',9),('tecnologia','office',8),
('tecnologia','cafe',7),('tecnologia','restaurant',7),('tecnologia','library',6),
('tecnologia','tech_office',6),('tecnologia','convention_center',5),('tecnologia','bank',5),('tecnologia','gym',4)
ON CONFLICT (segment_id, place_category) DO NOTHING;
"""

heredoc_cmd = "sudo -u postgres psql -d midiakit_prod <<'EOSQL'\n" + sql + "\nEOSQL"
ssh_exec(c, heredoc_cmd)

# Verify
ssh_exec(c, "sudo -u postgres psql -d midiakit_prod -c \"SELECT segment_id, COUNT(*) FROM segment_target_categories GROUP BY segment_id ORDER BY segment_id;\"")

# Grant permissions
ssh_exec(c, 'sudo -u postgres psql -d midiakit_prod -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO midiakit_app; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO midiakit_app;"')

c.close()
print("Done seeding new segments!")
