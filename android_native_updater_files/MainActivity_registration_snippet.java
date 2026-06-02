import com.yourpackage.mythbound.MythboundUpdaterPlugin;

@Override
public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MythboundUpdaterPlugin.class);
    super.onCreate(savedInstanceState);
}
