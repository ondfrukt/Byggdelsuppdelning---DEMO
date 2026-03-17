INSTANCE_TYPE_SPECS = [
    {
        'key': 'assembly_to_product',
        'display_name': 'Assembly -> Product',
        'description': 'A parent Assembly contains or positions a Product as a structural child.',
        'category': 'strukturell',
        'parent_scope': 'Assembly',
        'child_scope': 'Product',
    },
    {
        'key': 'assembly_to_assembly',
        'display_name': 'Assembly -> Assembly',
        'description': 'A parent Assembly is built up from one or more child assemblies.',
        'category': 'strukturell',
        'parent_scope': 'Assembly',
        'child_scope': 'Assembly',
    },
    {
        'key': 'connection_to_product',
        'display_name': 'Connection -> Product',
        'description': 'A Connection instance places a Product inside a connection context.',
        'category': 'strukturell',
        'parent_scope': 'Connection',
        'child_scope': 'Product',
    },
    {
        'key': 'module_to_assembly',
        'display_name': 'Module -> Assembly',
        'description': 'A Module is built from one or more Assembly instances.',
        'category': 'strukturell',
        'parent_scope': 'Module',
        'child_scope': 'Assembly',
    },
    {
        'key': 'space_to_product',
        'display_name': 'Space -> Product',
        'description': 'A Space contains or hosts a Product instance.',
        'category': 'strukturell',
        'parent_scope': 'Space',
        'child_scope': 'Product',
    },
    {
        'key': 'space_to_assembly',
        'display_name': 'Space -> Assembly',
        'description': 'A Space contains or hosts an Assembly instance.',
        'category': 'strukturell',
        'parent_scope': 'Space',
        'child_scope': 'Assembly',
    },
    {
        'key': 'space_to_module',
        'display_name': 'Space -> Module',
        'description': 'A Space contains or hosts a Module instance.',
        'category': 'strukturell',
        'parent_scope': 'Space',
        'child_scope': 'Module',
    },
    {
        'key': 'subsys_to_product',
        'display_name': 'SubSys -> Product',
        'description': 'A SubSys contains or hosts a Product instance.',
        'category': 'strukturell',
        'parent_scope': 'SubSys',
        'child_scope': 'Product',
    },
    {
        'key': 'sys_to_subsys',
        'display_name': 'Sys -> SubSys',
        'description': 'A Sys contains or hosts a SubSys instance.',
        'category': 'strukturell',
        'parent_scope': 'Sys',
        'child_scope': 'SubSys',
    },
]

ALLOWED_INSTANCE_TYPES = {item['key'] for item in INSTANCE_TYPE_SPECS}


def get_instance_type_specs():
    return [dict(item) for item in INSTANCE_TYPE_SPECS]
